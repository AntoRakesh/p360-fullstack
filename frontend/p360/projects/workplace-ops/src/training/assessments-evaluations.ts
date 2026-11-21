// Training › Assessments & Evaluations — quiz bank, results, pass rates, score distribution, quiz player, practical evaluations.
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { Series, UI } from '@p360/shared/ui';
import { TrnPick } from './training-pages-a';
import { TrnPage } from './training-ui';
import { Attempt, CERT_TYPES, DEPTS, downloadCsv, iso, PEOPLE, PERSON, PracticalEval, Question, Quiz, SKILL_SEED } from './training.data';

const CT_COURSE: Record<string, string> = Object.fromEntries(CERT_TYPES.map((t) => [t.id, t.courseId]));

const BINS = ['<50', '50–59', '60–69', '70–79', '80–89', '90–100'];
const bin = (s: number) => (s < 50 ? 0 : s >= 90 ? 5 : Math.floor(s / 10) - 4);
const CRITERIA: Record<string, string[]> = {
  fa: ['Scene safety & danger check', 'Primary survey (DR ABC)', 'CPR depth & rate', 'AED placement & use', 'Casualty handover'],
  fs: ['Raises the alarm correctly', 'Selects the right extinguisher', 'PASS technique', 'Safe distance & exit route', 'Post-incident reporting'],
  wah: ['Harness pre-use inspection', 'Correct donning & fit', 'Anchor point selection', '100% tie-off during transfer', 'Rescue plan awareness'],
  fl: ['Pre-shift inspection', 'Load handling & stability', 'Manoeuvring in aisles', 'Pedestrian awareness', 'Parking & shutdown'],
  hi: ['Identifies hazards on walk-down', 'Rates likelihood & severity', 'Proposes controls (hierarchy)', 'Records on HIRA form', 'Communicates to team'],
  sp: ['Badge & access checks', 'Visitor escort procedure', 'Suspicious item response', 'Radio / incident reporting', 'Patrol log accuracy'],
  er: ['Muster accountability', 'Search & sweep pattern', 'Casualty extraction', 'Liaison with emergency services', 'Debrief & reporting'],
  eo: ['Pre-start checks', 'Safe start-up sequence', 'Normal operation', 'Isolation & shutdown', 'Fault reporting'],
};
const ASSESSORS = ['Meera Iyer', 'Priya Sharma', 'James Carter', 'Fatima Ali', 'Hannah Lee', 'Zara Khan', 'David Lee'];

@Component({
  selector: 'app-training-assessments-evaluations',
  imports: [...UI, DataTable, TrnPick],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Assessments & Evaluations" parent="Training, Skills & Compliance" [parentLink]="base" subtitle="Knowledge checks, results and practical on-the-job evaluations that validate competency levels.">
      <button class="btn-primary" (click)="openCreate()"><app-icon name="plus" [size]="16" />New Assessment</button>
      <button class="btn-ghost" (click)="openSchedule()"><app-icon name="calendar-days" [size]="16" />Schedule Evaluation</button>
      <button class="btn-ghost" (click)="exportResults()"><app-icon name="download" [size]="16" />Export Results</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Assessments in Bank" [value]="store.quizzes().length" icon="training-quiz" color="var(--ka-7c3aed)" [sub]="qCount() + ' questions'" />
      <app-kpi label="Attempts (40 days)" [value]="store.attempts().length" icon="activity" color="var(--ka-3b82f6)" change="12%" sub="vs. previous period" />
      <app-kpi label="Average Score" [value]="k().avg + '%'" icon="training-target" color="var(--ka-f59e0b)" [sub]="'median ' + k().median + '%'" />
      <app-kpi label="First-time Pass Rate" [value]="k().pass + '%'" icon="training-check" color="var(--ka-22c55e)" [sub]="k().failed + ' failed attempts'" subColor="var(--ka-dc2626)" />
      <app-kpi label="Practical Evaluations Due" [value]="k().pending" icon="hard-hat" color="var(--ka-ef4444)" [sub]="k().week + ' due this week'" />
    </section>

    <div class="tabs main">
      @for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}<span class="count">{{ tabCount(t) }}</span></button>}
    </div>

    @switch (tab()) {
      @case ('Assessment Bank') {
        <section class="bank">
          <div class="bank-l">
            <div class="bar">
              <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search assessments..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
              <select class="select" [value]="cat()" (change)="cat.set($any($event.target).value)"><option>All Categories</option><option>Safety</option><option>Technical</option><option>Soft Skills</option><option>Compliance</option></select>
            </div>
            <div class="qgrid">
              @for (s of quizStats(); track s.quiz.id) {
                @let sk = skill(s.quiz.skillId);
                <article class="card qc" [class.on]="focus() === s.quiz.id" (click)="focus.set(focus() === s.quiz.id ? null : s.quiz.id)">
                  <div class="qh">
                    <span class="qi" [style.background]="'color-mix(in srgb, ' + sk.color + ' 12%, transparent)'" [style.color]="sk.color"><app-icon [name]="sk.icon" [size]="18" /></span>
                    <div><b>{{ s.quiz.title }}</b><small>{{ s.quiz.id }} · {{ sk.name }} · {{ course(s.quiz.courseId)?.title }}</small></div>
                    <app-ring [value]="s.passRate" [size]="46" [color]="s.passRate >= 75 ? 'var(--ka-22c55e)' : s.passRate >= 60 ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)'" />
                  </div>
                  <div class="qm">
                    <span><app-icon name="training-quiz" [size]="13" />{{ s.quiz.questions.length }} questions</span>
                    <span><app-icon name="clock" [size]="13" />{{ s.quiz.minutes }} min</span>
                    <span><app-icon name="training-flag" [size]="13" />Pass {{ s.quiz.pass }}%</span>
                  </div>
                  <div class="qs"><div><small>Attempts</small><b>{{ s.n }}</b></div><div><small>Avg score</small><b>{{ s.avg }}%</b></div><div><small>Assigned</small><b>{{ s.assigned }}</b></div></div>
                  <div class="qa">
                    <button class="btn-ghost sm" (click)="$event.stopPropagation(); play(s.quiz, 'preview')"><app-icon name="eye" [size]="14" />Preview</button>
                    <button class="btn-ghost sm" (click)="$event.stopPropagation(); play(s.quiz, 'take')"><app-icon name="play" [size]="14" />Take</button>
                    <button class="btn-primary btn-sm" (click)="$event.stopPropagation(); assignFor.set(s.quiz.id)">Assign</button>
                  </div>
                </article>
              } @empty {<p class="muted">No assessments match.</p>}
            </div>
          </div>
          <div class="side">
            <div class="card">
              <div class="card-head"><h3>Score Distribution</h3><span class="muted">{{ focus() ? quizTitle(focus()!) : 'All assessments' }}</span></div>
              <app-column-chart [labels]="bins" [series]="dist()" [height]="200" [legend]="false" />
            </div>
            <div class="card">
              <div class="card-head"><h3>Pass Rate by Assessment</h3></div>
              <app-bar-list [rows]="passRows()" [max]="100" />
            </div>
          </div>
        </section>
      }
      @case ('Results') {
        <section class="res">
          <div class="card">
            <app-data-table [rows]="results()" [columns]="rCols" [filters]="rFilters()" [actions]="rActions" [searchKeys]="['name', 'empId', 'quiz']" searchPlaceholder="Search employee or assessment..." noun="results"
              [selectable]="true" [bulkActions]="rBulk" (bulk)="rBulkAct($event.action, $event.ids)" (action)="rAct($event.action, $event.row)" (rowClick)="viewAttempt($event)" [activeId]="att()?.id ?? null" />
          </div>
          <div class="side">
            <div class="card">
              <div class="card-head"><h3>Average Score Trend</h3><span class="muted">weekly</span></div>
              <app-line-chart [labels]="weeks" [series]="weekly()" [height]="190" [min]="50" [max]="100" suffix="%" />
            </div>
            <div class="card">
              <div class="card-head"><h3>Awaiting Attempt</h3><span class="muted">{{ store.quizAssigned().length }} assigned</span></div>
              <ul class="aw">
                @for (a of store.quizAssigned().slice(0, 8); track a.id) {
                  @let p = person(a.empId);
                  <li><span class="dt-av" [style.background]="p.avatar">{{ p.initials }}</span><div><b>{{ p.name }}</b><small>{{ quizTitle(a.quizId) }} · due {{ fd(a.due) }}</small></div>
                    <button class="btn-ghost sm" (click)="play(quiz(a.quizId), 'take', a.empId)">Start</button></li>
                } @empty {<li class="muted">Nothing outstanding.</li>}
              </ul>
            </div>
          </div>
        </section>
      }
      @case ('Practical Evaluations') {
        <section class="res">
          <div class="card">
            <div class="card-head"><h3>On-the-job Evaluations</h3>
              <div class="tabs">@for (s of evalTabs; track s) {<button [class.on]="evalTab() === s" (click)="evalTab.set(s)">{{ s }}</button>}</div>
            </div>
            <ul class="ev">
              @for (e of evals(); track e.id) {
                @let p = person(e.empId);
                @let sk = skill(e.skillId);
                @let d = days(e.due);
                <li>
                  <span class="dt-av" [style.background]="p.avatar">{{ p.initials }}</span>
                  <div class="evn"><b>{{ p.name }}</b><small>{{ p.id }} · {{ p.role }} · {{ p.dept }}</small></div>
                  <div class="evs"><span class="qi sm" [style.background]="'color-mix(in srgb, ' + sk.color + ' 12%, transparent)'" [style.color]="sk.color"><app-icon [name]="sk.icon" [size]="14" /></span><div><b>{{ sk.name }}</b><small>Assessor: {{ e.assessor }}</small></div></div>
                  <div class="evd"><small>{{ e.status === 'Completed' ? 'Evaluated' : 'Due' }}</small><b [class.red]="e.status === 'Pending' && d < 0">{{ fd(e.due) }}</b></div>
                  @if (e.status === 'Completed') {
                    <span class="stars">@for (i of five; track i) {<i [class.on]="i <= (e.rating ?? 0)">★</i>}</span>
                    <span class="tag green">Completed</span>
                  } @else {
                    <span [class]="d < 0 ? 'tag red' : d <= 2 ? 'tag amber' : 'tag blue'">{{ d < 0 ? -d + 'd overdue' : d === 0 ? 'Today' : 'in ' + d + 'd' }}</span>
                    <button class="btn-primary btn-sm" (click)="openEval(e)">Evaluate</button>
                  }
                </li>
              } @empty {<li class="muted">No evaluations.</li>}
            </ul>
          </div>
          <div class="side">
            <div class="card">
              <div class="card-head"><h3>Evaluations by Skill</h3></div>
              <app-bar-list [rows]="evalBySkill()" [max]="evalMax()" />
            </div>
            <div class="card">
              <div class="card-head"><h3>Assessor Workload</h3><span class="muted">pending</span></div>
              <ul class="wl">
                @for (w of workload(); track w.name) {<li><span>{{ w.name }}</span><span class="wlb"><i [style.width.%]="(w.n / workloadMax()) * 100"></i></span><b>{{ w.n }}</b></li>}
              </ul>
            </div>
          </div>
        </section>
      }
    }

    <!-- Quiz player / preview -->
    @if (player(); as pl) {
      @let qz = pl.quiz;
      <div class="g-overlay" (click)="closePlayer()"></div>
      <div class="g-modal wide qp">
        <div class="modal-head">
          <div><h3>{{ qz.title }}</h3><small class="muted">{{ pl.mode === 'preview' ? 'Preview · answers shown' : 'Candidate: ' + person(pl.empId).name }} · pass mark {{ qz.pass }}% · {{ qz.minutes }} min</small></div>
          <button class="close-btn" (click)="closePlayer()">×</button>
        </div>
        @if (pl.mode === 'take' && !pl.done) {
          <div class="who">
            <label>Candidate<select class="select" [value]="pl.empId" (change)="player.set({ ...pl, empId: $any($event.target).value })">@for (p of candidates; track p.id) {<option [value]="p.id">{{ p.name }} · {{ p.id }}</option>}</select></label>
            <span class="timer"><app-icon name="clock" [size]="14" />{{ elapsed() }}</span>
          </div>
        }
        @if (!pl.done) {
          <div class="steps">@for (x of qz.questions; track $index) {<button [class.on]="$index === pl.i" [class.ans]="pl.ans[$index] !== null" (click)="player.set({ ...pl, i: $index })">{{ $index + 1 }}</button>}</div>
          @let qq = qz.questions[pl.i];
          <div class="qq">
            <small>Question {{ pl.i + 1 }} of {{ qz.questions.length }}</small>
            <h4>{{ qq.q }}</h4>
            <div class="opts">
              @for (o of qq.options; track $index) {
                <button class="opt" [class.pick]="pl.ans[pl.i] === $index" [class.right]="pl.mode === 'preview' && qq.answer === $index" (click)="pick($index)">
                  <span class="ol">{{ 'ABCD'[$index] }}</span>{{ o }}
                </button>
              }
            </div>
            @if (pl.mode === 'preview') {<p class="why"><app-icon name="lightbulb" [size]="14" />{{ qq.why }}</p>}
          </div>
          <div class="form-actions">
            <span class="muted mr">{{ answered(pl.ans) }} / {{ qz.questions.length }} answered</span>
            <button class="btn-ghost" [disabled]="pl.i === 0" (click)="player.set({ ...pl, i: pl.i - 1 })">Previous</button>
            @if (pl.i < qz.questions.length - 1) {<button class="btn-primary" (click)="player.set({ ...pl, i: pl.i + 1 })">Next</button>}
            @else if (pl.mode === 'take') {<button class="btn-primary" [disabled]="answered(pl.ans) < qz.questions.length" (click)="submit()">Submit Assessment</button>}
            @else {<button class="btn-primary" (click)="closePlayer()">Close Preview</button>}
          </div>
        } @else {
          @let sc = scoreOf(qz, pl.ans);
          <div class="result" [class.fail]="sc < qz.pass">
            <app-ring [value]="sc" [size]="96" [color]="sc >= qz.pass ? 'var(--ka-22c55e)' : 'var(--ka-ef4444)'" />
            <div><h3>{{ sc >= qz.pass ? 'Passed' : 'Not yet competent' }}</h3>
              <p class="muted">{{ person(pl.empId).name }} scored {{ sc }}% (pass mark {{ qz.pass }}%).
                @if (sc >= qz.pass) { Result recorded and {{ skill(qz.skillId).name }} competency updated. } @else { A retake has been assigned automatically. }</p></div>
          </div>
          <h4 class="rv">Answer review</h4>
          <ol class="review">
            @for (qq of qz.questions; track $index) {
              @let ok = pl.ans[$index] === qq.answer;
              <li [class.bad]="!ok"><b>{{ qq.q }}</b>
                <small>{{ ok ? '✓' : '✗' }} Your answer: {{ qq.options[pl.ans[$index] ?? 0] }}@if (!ok) { · Correct: {{ qq.options[qq.answer] }}}</small>
                <em>{{ qq.why }}</em></li>
            }
          </ol>
          <div class="form-actions"><button class="btn-ghost" (click)="play(qz, 'take', pl.empId)">Retake</button><button class="btn-primary" (click)="closePlayer(); tab.set('Results')">View Results</button></div>
        }
      </div>
    }

    <!-- Attempt drawer -->
    @if (att(); as a) {
      @let p = person(a.empId);
      @let qz = quiz(a.quizId);
      <div class="g-overlay" (click)="att.set(null)"></div>
      <aside class="g-drawer">
        <div class="modal-head"><h3>Assessment Result</h3><button class="close-btn" (click)="att.set(null)">×</button></div>
        <div class="ad">
          <app-ring [value]="a.score" [size]="80" [color]="a.passed ? 'var(--ka-22c55e)' : 'var(--ka-ef4444)'" />
          <div><b>{{ p.name }}</b><small>{{ p.id }} · {{ p.role }} · {{ p.dept }}</small><span [class]="a.passed ? 'tag green' : 'tag red'">{{ a.passed ? 'Passed' : 'Failed' }}</span></div>
        </div>
        <dl class="kv">
          <dt>Assessment</dt><dd>{{ qz.title }}</dd>
          <dt>Date</dt><dd>{{ fd(a.at) }}</dd>
          <dt>Time taken</dt><dd>{{ a.mins }} of {{ qz.minutes }} min</dd>
          <dt>Pass mark</dt><dd>{{ qz.pass }}%</dd>
          <dt>Correct answers</dt><dd>{{ Math.round((a.score / 100) * qz.questions.length) }} / {{ qz.questions.length }}</dd>
        </dl>
        <h4>Attempt history</h4>
        <ul class="hist">
          @for (h of history(a); track h.id) {<li [class.cur]="h.id === a.id"><span>{{ fd(h.at) }}</span><span class="hb"><i [style.width.%]="h.score" [style.background]="h.passed ? 'var(--ka-22c55e)' : 'var(--ka-ef4444)'"></i></span><b>{{ h.score }}%</b></li>}
        </ul>
        <div class="form-actions">
          <button class="btn-ghost" (click)="go('training-plan-enrollment', { emp: a.empId })">Training plan</button>
          @if (!a.passed) {<button class="btn-primary" (click)="retake(a)">Assign Retake</button>} @else {<button class="btn-primary" (click)="certificate(a)">Issue Certificate</button>}
        </div>
      </aside>
    }

    <!-- Practical evaluation form -->
    @if (ev(); as f) {
      @let e = f.e;
      @let sk = skill(e.skillId);
      <div class="g-overlay" (click)="ev.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveEval()">
        <div class="modal-head"><div><h3>Practical Evaluation · {{ sk.name }}</h3><small class="muted">{{ person(e.empId).name }} · Assessor {{ e.assessor }}</small></div><button type="button" class="close-btn" (click)="ev.set(null)">×</button></div>
        <ul class="crit">
          @for (c of criteria(e.skillId); track c; let i = $index) {
            <li><span>{{ c }}</span>
              <span class="stars big">@for (s of five; track s) {<button type="button" [class.on]="s <= f.r[i]" (click)="rate(i, s)">★</button>}</span></li>
          }
        </ul>
        <div class="evsum"><span>Overall</span><b>{{ evAvg() }} / 5</b><span [class]="evAvg() >= 3 ? 'tag green' : 'tag red'">{{ evAvg() >= 3 ? 'Competent' : 'Not yet competent' }}</span></div>
        <div class="form-grid">
          <label class="full">Assessor notes<textarea class="input" rows="3" [value]="f.notes" (input)="ev.set({ ...f, notes: $any($event.target).value })" placeholder="Observations, follow-up actions..."></textarea></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="ev.set(null)">Cancel</button><button class="btn-primary" type="submit" [disabled]="f.r.includes(0)">Sign off Evaluation</button></div>
      </form>
    }

    <!-- Schedule evaluation -->
    @if (sf(); as f) {
      <div class="g-overlay" (click)="sf.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveSchedule()">
        <div class="modal-head"><h3>Schedule Practical Evaluation</h3><button type="button" class="close-btn" (click)="sf.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Employee *<input class="input" list="trn-people-ev" placeholder="Type a name or EMP ID" [value]="f.who" (input)="sf.set({ ...f, who: $any($event.target).value })" />
            <datalist id="trn-people-ev">@for (p of candidates; track p.id) {<option [value]="p.id + ' · ' + p.name"></option>}</datalist></label>
          <label>Skill<select class="select" [value]="f.skillId" (change)="sf.set({ ...f, skillId: $any($event.target).value })">@for (s of evalSkills; track s.id) {<option [value]="s.id">{{ s.name }}</option>}</select></label>
          <label>Assessor<select class="select" [value]="f.assessor" (change)="sf.set({ ...f, assessor: $any($event.target).value })">@for (a of assessors; track a) {<option>{{ a }}</option>}</select></label>
          <label>Date<input class="input" type="date" [value]="f.due" (change)="sf.set({ ...f, due: $any($event.target).value })" /></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="sf.set(null)">Cancel</button><button class="btn-primary" type="submit">Schedule</button></div>
      </form>
    }

    <!-- Create assessment -->
    @if (cf(); as f) {
      <div class="g-overlay" (click)="cf.set(null)"></div>
      <form class="g-modal wide" (submit)="$event.preventDefault(); saveCreate()">
        <div class="modal-head"><h3>New Assessment</h3><button type="button" class="close-btn" (click)="cf.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Title *<input class="input" [value]="f.title" (input)="cf.set({ ...f, title: $any($event.target).value })" placeholder="e.g. Confined Space Entry Theory" /></label>
          <label>Skill<select class="select" [value]="f.skillId" (change)="cf.set({ ...f, skillId: $any($event.target).value })">@for (s of store.skills(); track s.id) {<option [value]="s.id">{{ s.name }}</option>}</select></label>
          <label>Linked course<select class="select" [value]="f.courseId" (change)="cf.set({ ...f, courseId: $any($event.target).value })">@for (c of store.courses(); track c.id) {<option [value]="c.id">{{ c.id }} · {{ c.title }}</option>}</select></label>
          <label>Pass mark (%)<input class="input" type="number" min="40" max="100" [value]="f.pass" (input)="cf.set({ ...f, pass: +$any($event.target).value })" /></label>
          <label>Time limit (min)<input class="input" type="number" min="2" max="90" [value]="f.minutes" (input)="cf.set({ ...f, minutes: +$any($event.target).value })" /></label>
        </div>
        <h4>Questions ({{ f.questions.length }})</h4>
        @for (qq of f.questions; track $index; let qi = $index) {
          <div class="qb">
            <div class="qbh"><b>Q{{ qi + 1 }}</b><input class="input" [value]="qq.q" placeholder="Question text" (input)="editQ(qi, { q: $any($event.target).value })" />
              <button type="button" class="close-btn" [disabled]="f.questions.length === 1" (click)="removeQ(qi)">×</button></div>
            <div class="qbo">
              @for (o of qq.options; track $index; let oi = $index) {
                <label [class.right]="qq.answer === oi"><input type="radio" [name]="'ans' + qi" [checked]="qq.answer === oi" (change)="editQ(qi, { answer: oi })" /><input class="input" [value]="o" [placeholder]="'Option ' + 'ABCD'[oi]" (input)="editOpt(qi, oi, $any($event.target).value)" /></label>
              }
            </div>
          </div>
        }
        <button type="button" class="btn-ghost sm" (click)="addQ()"><app-icon name="plus" [size]="14" />Add question</button>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="cf.set(null)">Cancel</button><button class="btn-primary" type="submit">Publish to Bank</button></div>
      </form>
    }

    @if (assignFor(); as qid) {
      <app-trn-pick [title]="'Assign · ' + quizTitle(qid)" cta="Assign assessment" (picked)="assignDone(qid, $event.ids, $event.due)" (closed)="assignFor.set(null)" />
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .tabs.main { margin-bottom: 12px; } :host ::ng-deep .res .mini-progress { width: 48px; }
    .bank, .res { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 12px; align-items: start; }
    .side { display: flex; flex-direction: column; gap: 12px; }
    .bar { display: flex; gap: 8px; margin-bottom: 12px; } .bar .search-box { flex: 1; } .bar input { width: 100%; }
    .qgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
    .qc { display: flex; flex-direction: column; gap: 10px; cursor: pointer; border: 1px solid transparent; transition: border-color .15s, box-shadow .15s; }
    .qc:hover { box-shadow: 0 4px 14px rgba(40, 30, 90, .08); } .qc.on { border-color: var(--primary); }
    .qh { display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; align-items: center; } .qh > div { display: flex; flex-direction: column; min-width: 0; }
    .qh b { font-size: 13.5px; } .qh small { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qi { width: 36px; height: 36px; border-radius: 9px; display: grid; place-items: center; } .qi.sm { width: 28px; height: 28px; border-radius: 7px; flex-shrink: 0; }
    .qm { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11.5px; color: var(--kf-4b4f6b); } .qm span { display: inline-flex; gap: 4px; align-items: center; }
    .qs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; background: var(--kb-f7f7fb); border-radius: 8px; padding: 8px 10px; } .qs div { display: flex; flex-direction: column; } .qs small { font-size: 10.5px; color: var(--muted); } .qs b { font-size: 15px; }
    .qa { display: flex; gap: 6px; justify-content: flex-end; } .qa button { display: inline-flex; align-items: center; gap: 4px; }
    .aw, .ev, .wl, .hist { list-style: none; margin: 0; padding: 0; }
    .aw li { display: grid; grid-template-columns: 28px 1fr auto; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12px; }
    .aw li > div { display: flex; flex-direction: column; min-width: 0; } .aw small { color: var(--muted); font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ev li { display: grid; grid-template-columns: 30px minmax(140px, 1.2fr) minmax(160px, 1.3fr) 96px auto auto; gap: 12px; align-items: center; padding: 10px 4px; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .evn, .evd { display: flex; flex-direction: column; min-width: 0; } .evn small, .evd small, .evs small { color: var(--muted); font-size: 11px; }
    .evs { display: flex; gap: 8px; align-items: center; min-width: 0; } .evs > div { display: flex; flex-direction: column; }
    .red { color: var(--kf-dc2626); }
    .stars i, .stars button { font-style: normal; color: var(--kf-d8dbe6); font-size: 15px; } .stars .on { color: var(--kf-f59e0b); }
    .stars.big button { border: 0; background: none; cursor: pointer; font-size: 22px; padding: 0 1px; } .stars.big button:hover { transform: scale(1.15); }
    .wl li { display: grid; grid-template-columns: 110px 1fr 24px; gap: 10px; align-items: center; padding: 6px 0; font-size: 12px; }
    .wlb { height: 7px; background: var(--kb-eef0f6); border-radius: 4px; overflow: hidden; } .wlb i { display: block; height: 100%; background: var(--kb-8b5cf6); }
    .qp .modal-head small { display: block; margin-top: 2px; }
    .who { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; margin-bottom: 12px; } .who label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; min-width: 300px; }
    .timer { display: inline-flex; gap: 5px; align-items: center; font-variant-numeric: tabular-nums; background: var(--kb-f3f3f8); padding: 5px 10px; border-radius: 6px; font-size: 13px; }
    .steps { display: flex; gap: 6px; margin-bottom: 14px; }
    .steps button { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border); background: var(--kb-ffffff); cursor: pointer; font-weight: 600; color: var(--kf-4b4f6b); }
    .steps button.ans { background: var(--primary-soft); color: var(--primary); border-color: transparent; } .steps button.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .qq small { color: var(--muted); } .qq h4 { font-size: 16px; margin: 4px 0 14px; }
    .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .opt { display: flex; align-items: center; gap: 10px; text-align: left; padding: 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--kb-ffffff); cursor: pointer; font-size: 13px; }
    .opt:hover { border-color: var(--kl-c4b5fd); } .opt.pick { border-color: var(--primary); background: var(--kb-faf7ff); } .opt.right { border-color: var(--kl-22c55e); background: var(--kb-f0fdf4); }
    .ol { width: 26px; height: 26px; border-radius: 50%; background: var(--kb-f3f3f8); display: grid; place-items: center; font-weight: 700; font-size: 12px; flex-shrink: 0; } .opt.pick .ol { background: var(--primary); color: var(--kf-ffffff); }
    .why { display: flex; gap: 6px; align-items: center; background: var(--kb-fffbeb); color: var(--kf-92400e); padding: 8px 10px; border-radius: 8px; font-size: 12.5px; margin: 12px 0 0; }
    .mr { margin-right: auto; align-self: center; }
    .result { display: flex; gap: 18px; align-items: center; padding: 14px; border-radius: 10px; background: var(--kb-f0fdf4); } .result.fail { background: var(--kb-fef2f2); } .result h3 { font-size: 20px; }
    .rv { margin: 16px 0 6px; } .review { margin: 0; padding-left: 20px; max-height: 260px; overflow: auto; }
    .review li { padding: 6px 0; font-size: 12.5px; display: list-item; } .review li b { display: block; } .review small { display: block; color: var(--kf-15803d); } .review li.bad small { color: var(--kf-b91c1c); } .review em { display: block; color: var(--muted); font-size: 11.5px; }
    .ad { display: flex; gap: 14px; align-items: center; margin-bottom: 12px; } .ad > div { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; } .ad small { color: var(--muted); font-size: 11.5px; }
    .kv { display: grid; grid-template-columns: 120px 1fr; gap: 6px 10px; font-size: 12.5px; margin: 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; font-weight: 500; }
    h4 { margin: 16px 0 6px; font-size: 13px; }
    .hist li { display: grid; grid-template-columns: 90px 1fr 40px; gap: 8px; align-items: center; padding: 5px 4px; font-size: 12px; border-radius: 6px; } .hist li.cur { background: var(--primary-soft); }
    .hb { height: 6px; background: var(--kb-eef0f6); border-radius: 4px; overflow: hidden; } .hb i { display: block; height: 100%; }
    .crit { list-style: none; margin: 0; padding: 0; } .crit li { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 13px; }
    .evsum { display: flex; gap: 10px; align-items: center; margin: 12px 0; font-size: 13px; } .evsum b { font-size: 18px; }
    textarea.input { resize: vertical; font: inherit; }
    .qb { border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin-bottom: 8px; }
    .qbh { display: flex; gap: 8px; align-items: center; } .qbh .input { flex: 1; }
    .qbo { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; } .qbo label { display: flex; gap: 6px; align-items: center; } .qbo .input { flex: 1; } .qbo label.right .input { border-color: var(--kl-22c55e); }
    @media (max-width: 1250px) { .bank, .res { grid-template-columns: 1fr; } .ev li { grid-template-columns: 30px 1fr 1fr; } }
  `,
})
export class AssessmentsEvaluations extends TrnPage {
  protected readonly Math = Math;
  protected readonly tabs = ['Assessment Bank', 'Results', 'Practical Evaluations'];
  protected readonly tab = signal('Assessment Bank');
  protected readonly bins = BINS;
  protected readonly five = [1, 2, 3, 4, 5];
  protected readonly assessors = ASSESSORS;
  protected readonly candidates = PEOPLE.slice(0, 300);
  protected readonly evalSkills = SKILL_SEED.filter((s) => s.category === 'Safety');
  protected readonly q = signal('');
  protected readonly cat = signal('All Categories');
  protected readonly focus = signal<string | null>(null);
  protected readonly assignFor = signal<string | null>(null);
  protected readonly err = signal('');

  protected skill(id: string) {
    return this.store.skillById().get(id) ?? SKILL_SEED[0];
  }
  protected quiz(id: string) {
    return this.store.quizzes().find((q) => q.id === id)!;
  }
  protected quizTitle(id: string) {
    return this.quiz(id)?.title ?? id;
  }
  protected readonly qCount = computed(() => this.store.quizzes().reduce((a, q) => a + q.questions.length, 0));
  protected tabCount(t: string) {
    return t === 'Assessment Bank' ? this.store.quizzes().length : t === 'Results' ? this.store.attempts().length : this.store.evals().filter((e) => e.status === 'Pending').length;
  }

  /* ---------- KPIs ---------- */
  protected readonly k = computed(() => {
    const a = this.store.attempts();
    const sc = a.map((x) => x.score).sort((x, y) => x - y);
    const firsts = new Map<string, Attempt>();
    [...a].reverse().forEach((x) => !firsts.has(x.quizId + x.empId) && firsts.set(x.quizId + x.empId, x));
    const f = [...firsts.values()];
    const pend = this.store.evals().filter((e) => e.status === 'Pending');
    return {
      avg: Math.round(sc.reduce((s, x) => s + x, 0) / (sc.length || 1)),
      median: sc[Math.floor(sc.length / 2)] ?? 0,
      pass: Math.round((f.filter((x) => x.passed).length / (f.length || 1)) * 100),
      failed: a.filter((x) => !x.passed).length,
      pending: pend.length,
      week: pend.filter((e) => this.days(e.due) <= 7).length,
    };
  });

  /* ---------- bank ---------- */
  protected readonly quizStats = computed(() => {
    const q = this.q().toLowerCase().trim();
    const cat = this.cat();
    return this.store
      .quizzes()
      .filter((z) => (!q || z.title.toLowerCase().includes(q)) && (cat === 'All Categories' || this.skill(z.skillId).category === cat))
      .map((quiz) => {
        const at = this.store.attempts().filter((a) => a.quizId === quiz.id);
        return {
          quiz, n: at.length,
          avg: at.length ? Math.round(at.reduce((s, a) => s + a.score, 0) / at.length) : 0,
          passRate: at.length ? Math.round((at.filter((a) => a.passed).length / at.length) * 100) : 0,
          assigned: this.store.quizAssigned().filter((a) => a.quizId === quiz.id).length,
        };
      });
  });
  protected readonly dist = computed<Series[]>(() => {
    const f = this.focus();
    const at = this.store.attempts().filter((a) => !f || a.quizId === f);
    const pass = BINS.map(() => 0), fail = BINS.map(() => 0);
    at.forEach((a) => (a.passed ? pass : fail)[bin(a.score)]++);
    return [{ name: 'Passed', color: 'var(--ka-22c55e)', values: pass }, { name: 'Failed', color: 'var(--ka-ef4444)', values: fail }];
  });
  protected readonly passRows = computed(() =>
    this.quizStats().map((s) => ({ label: s.quiz.title.replace(/ (Knowledge Check|Theory|Safety)$/, ''), value: s.passRate, display: s.passRate + '%', color: s.passRate >= 75 ? 'var(--ka-22c55e)' : s.passRate >= 60 ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)' })).sort((a, b) => b.value - a.value),
  );
  protected assignDone(quizId: string, ids: string[], due: string) {
    const have = new Set(this.store.quizAssigned().filter((a) => a.quizId === quizId).map((a) => a.empId));
    const add = ids.filter((id) => !have.has(id)).map((empId, i) => ({ id: `QA-${Date.now()}-${i}`, quizId, empId, due }));
    this.store.quizAssigned.update((l) => [...add, ...l]);
    this.assignFor.set(null);
    this.msg(`${this.quizTitle(quizId)} assigned to ${add.length} employee(s) · due ${this.fd(due)}`);
  }

  /* ---------- results ---------- */
  protected readonly results = computed(() =>
    this.store.attempts().map((a) => {
      const p = this.person(a.empId);
      const qz = this.quiz(a.quizId);
      return { ...a, name: p.name, initials: p.initials, avatar: p.avatar, dept: p.dept, quiz: qz?.title ?? a.quizId, skill: this.skill(qz?.skillId ?? 'fa').name, passMark: qz?.pass, result: a.passed ? 'Passed' : 'Failed' };
    }),
  );
  protected readonly rCols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'quiz', label: 'Assessment', sub: 'skill' },
    { key: 'score', label: 'Score', kind: 'progress' },
    { key: 'passMark', label: 'Pass Mark', fmt: (v) => v + '%' },
    { key: 'at', label: 'Date', fmt: (v) => this.fd(v) },
    { key: 'mins', label: 'Duration', fmt: (v) => v + ' min' },
    { key: 'result', label: 'Result', kind: 'tag', tag: (r) => (r.passed ? 'tag green' : 'tag red') },
  ];
  protected readonly rFilters = computed(() => [
    { key: 'quiz', label: 'Assessment', options: this.store.quizzes().map((q) => q.title) },
    { key: 'result', label: 'Result', options: ['Passed', 'Failed'] },
    { key: 'dept', label: 'Department', options: DEPTS },
  ]);
  protected readonly rActions: RowAction[] = [
    { id: 'view', label: 'View result', icon: 'eye' },
    { id: 'retake', label: 'Assign retake', icon: 'training-repeat', when: (r) => !r.passed },
    { id: 'cert', label: 'Issue certificate', icon: 'training-award', when: (r) => r.passed },
    { id: 'delete', label: 'Void attempt', icon: 'training-trash', danger: true },
  ];
  protected readonly rBulk: RowAction[] = [{ id: 'retake', label: 'Assign retakes' }, { id: 'export', label: 'Export' }];
  protected readonly att = signal<Attempt | null>(null);
  protected viewAttempt(a: Attempt) {
    this.att.set(this.store.attempts().find((x) => x.id === a.id) ?? null);
  }
  protected history(a: Attempt) {
    return this.store.attempts().filter((x) => x.empId === a.empId && x.quizId === a.quizId);
  }
  protected rAct(act: string, r: Attempt) {
    if (act === 'view') return this.viewAttempt(r);
    if (act === 'retake') return this.retake(r);
    if (act === 'cert') return this.certificate(r);
    this.store.attempts.update((l) => l.filter((x) => x.id !== r.id));
    this.msg(`Attempt ${r.id} voided`);
  }
  protected rBulkAct(act: string, ids: string[]) {
    const rows = this.results().filter((r) => ids.includes(r.id));
    if (act === 'export') return this.csv('assessment-results-selected.csv', rows);
    const failed = rows.filter((r) => !r.passed);
    failed.forEach((r) => this.retake(r, false));
    this.msg(`${failed.length} retake(s) assigned${rows.length > failed.length ? ` · ${rows.length - failed.length} passed attempts skipped` : ''}`);
  }
  protected retake(a: Attempt, toast = true) {
    if (!this.store.quizAssigned().some((x) => x.quizId === a.quizId && x.empId === a.empId))
      this.store.quizAssigned.update((l) => [{ id: `QA-${Date.now()}-${a.id}`, quizId: a.quizId, empId: a.empId, due: iso(7) }, ...l]);
    if (toast) this.msg(`Retake of ${this.quizTitle(a.quizId)} assigned to ${this.person(a.empId).name} · due ${this.fd(iso(7))}`);
  }
  protected certificate(a: Attempt) {
    const qz = this.quiz(a.quizId);
    const c = this.store.certs().find((x) => x.empId === a.empId && CT_COURSE[x.typeId] === qz.courseId);
    if (c) {
      this.store.renew(c.id);
      this.msg(`Certificate ${c.number} renewed from assessment result`);
    } else this.msg(`Completion certificate for ${qz.title} issued to ${this.person(a.empId).name}`);
  }
  protected readonly weeks = ['W-5', 'W-4', 'W-3', 'W-2', 'W-1', 'This wk'];
  protected readonly weekly = computed<Series[]>(() => {
    const at = this.store.attempts();
    const avg = this.weeks.map((_, i) => {
      const lo = (5 - i) * 7, hi = lo + 6;
      const w = at.filter((a) => -this.days(a.at) >= lo && -this.days(a.at) <= hi);
      return w.length ? Math.round(w.reduce((s, a) => s + a.score, 0) / w.length) : 0;
    });
    return [{ name: 'Avg score', color: 'var(--ka-7c3aed)', area: true, values: avg }, { name: 'Typical pass mark', color: 'var(--ka-16a34a)', dashed: true, values: this.weeks.map(() => 80) }];
  });
  private csv(name: string, rows: ReturnType<AssessmentsEvaluations['results']>) {
    downloadCsv(name, [['Attempt', 'Employee ID', 'Employee', 'Department', 'Assessment', 'Skill', 'Score', 'Pass Mark', 'Result', 'Date', 'Minutes'], ...rows.map((r) => [r.id, r.empId, r.name, r.dept, r.quiz, r.skill, r.score, r.passMark ?? '', r.result, r.at, r.mins])]);
  }
  protected exportResults() {
    this.csv('assessment-results.csv', this.results());
    this.msg(`Exported ${this.results().length} results`);
  }

  /* ---------- quiz player ---------- */
  protected readonly player = signal<{ quiz: Quiz; mode: 'take' | 'preview'; empId: string; i: number; ans: (number | null)[]; done: boolean; t0: number } | null>(null);
  protected play(quiz: Quiz, mode: 'take' | 'preview', empId = 'EMP-001') {
    this.player.set({ quiz, mode, empId, i: 0, ans: quiz.questions.map((q) => (mode === 'preview' ? q.answer : null)), done: false, t0: Date.now() });
  }
  protected closePlayer() {
    this.player.set(null);
  }
  protected readonly elapsed = computed(() => {
    this.app.tick();
    const p = this.player();
    if (!p) return '0:00';
    const s = Math.floor((Date.now() - p.t0) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  protected pick(i: number) {
    const p = this.player()!;
    if (p.mode === 'preview') return;
    const ans = [...p.ans];
    ans[p.i] = i;
    this.player.set({ ...p, ans, i: p.i < p.quiz.questions.length - 1 ? p.i + 1 : p.i });
  }
  protected answered(a: (number | null)[]) {
    return a.filter((x) => x !== null).length;
  }
  protected scoreOf(q: Quiz, ans: (number | null)[]) {
    return Math.round((q.questions.filter((x, i) => ans[i] === x.answer).length / q.questions.length) * 100);
  }
  protected submit() {
    const p = this.player()!;
    const score = this.scoreOf(p.quiz, p.ans);
    const passed = score >= p.quiz.pass;
    const mins = Math.max(1, Math.round((Date.now() - p.t0) / 60000));
    this.store.attempts.update((l) => [{ id: `ATT-${7001 + l.length + 100}`, quizId: p.quiz.id, empId: p.empId, score, passed, at: iso(0), mins }, ...l]);
    this.store.quizAssigned.update((l) => l.filter((a) => !(a.quizId === p.quiz.id && a.empId === p.empId)));
    if (passed) {
      const cur = this.store.empById().get(p.empId)?.levels[p.quiz.skillId];
      if (cur !== undefined && cur !== null && cur < 3) this.store.setLevel(p.empId, p.quiz.skillId, 3, 'raised after passing assessment');
      else if (this.store.empById().has(p.empId)) this.store.addLog(`Passed ${p.quiz.title} (${score}%)`, p.empId);
    } else {
      this.store.quizAssigned.update((l) => [{ id: `QA-${Date.now()}`, quizId: p.quiz.id, empId: p.empId, due: iso(7) }, ...l]);
      if (this.store.empById().has(p.empId)) this.store.addLog(`Failed ${p.quiz.title} (${score}%) – retake assigned`, p.empId);
    }
    this.player.set({ ...p, done: true });
  }

  /* ---------- practical evaluations ---------- */
  protected readonly evalTabs = ['Pending', 'Completed', 'All'];
  protected readonly evalTab = signal('Pending');
  protected readonly evals = computed(() => {
    const t = this.evalTab();
    return this.store.evals().filter((e) => t === 'All' || e.status === t).sort((a, b) => (a.status === b.status ? a.due.localeCompare(b.due) : a.status === 'Pending' ? -1 : 1));
  });
  protected readonly evalBySkill = computed(() => {
    const m = new Map<string, { p: number; c: number }>();
    this.store.evals().forEach((e) => {
      const g = m.get(e.skillId) ?? { p: 0, c: 0 };
      e.status === 'Pending' ? g.p++ : g.c++;
      m.set(e.skillId, g);
    });
    return [...m.entries()].map(([id, g]) => ({ label: this.skill(id).name, value: g.p + g.c, display: `${g.c}/${g.p + g.c}`, color: this.skill(id).color })).sort((a, b) => b.value - a.value);
  });
  protected readonly evalMax = computed(() => Math.max(1, ...this.evalBySkill().map((r) => r.value)));
  protected readonly workload = computed(() => {
    const m = new Map<string, number>();
    this.store.evals().filter((e) => e.status === 'Pending').forEach((e) => m.set(e.assessor, (m.get(e.assessor) ?? 0) + 1));
    return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  });
  protected readonly workloadMax = computed(() => Math.max(1, ...this.workload().map((w) => w.n)));
  protected criteria(skillId: string) {
    return CRITERIA[skillId] ?? ['Follows the documented procedure', 'Uses correct PPE / tools', 'Works safely & efficiently', 'Communicates clearly', 'Handles an abnormal scenario'];
  }
  protected readonly ev = signal<{ e: PracticalEval; r: number[]; notes: string } | null>(null);
  protected openEval(e: PracticalEval) {
    this.ev.set({ e, r: this.criteria(e.skillId).map(() => 0), notes: '' });
  }
  protected rate(i: number, s: number) {
    const f = this.ev()!;
    const r = [...f.r];
    r[i] = s;
    this.ev.set({ ...f, r });
  }
  protected readonly evAvg = computed(() => {
    const r = this.ev()?.r ?? [];
    return r.length ? Math.round((r.reduce((a, x) => a + x, 0) / r.length) * 10) / 10 : 0;
  });
  protected saveEval() {
    const { e } = this.ev()!;
    const rating = Math.round(this.evAvg());
    this.store.evals.update((l) => l.map((x) => (x.id === e.id ? { ...x, status: 'Completed', rating, due: iso(0) } : x)));
    if (this.store.empById().has(e.empId)) this.store.setLevel(e.empId, e.skillId, Math.max(1, rating), 'set by practical evaluation');
    this.ev.set(null);
    this.msg(`${this.skill(e.skillId).name} evaluation signed off for ${this.person(e.empId).name} · ${rating}/5`);
  }
  protected readonly sf = signal<{ who: string; skillId: string; assessor: string; due: string } | null>(null);
  protected openSchedule() {
    this.err.set('');
    this.sf.set({ who: '', skillId: 'wah', assessor: ASSESSORS[0], due: iso(7) });
  }
  protected saveSchedule() {
    const f = this.sf()!;
    const p = PERSON.get(f.who.split('·')[0].trim());
    if (!p) return this.err.set('Pick an employee from the list.');
    const id = `PE-${309 + this.store.evals().length}`;
    this.store.evals.update((l) => [{ id, empId: p.id, skillId: f.skillId, assessor: f.assessor, due: f.due, status: 'Pending' }, ...l]);
    this.sf.set(null);
    this.tab.set('Practical Evaluations');
    this.evalTab.set('Pending');
    this.msg(`${this.skill(f.skillId).name} evaluation scheduled for ${p.name} on ${this.fd(f.due)} with ${f.assessor}`);
  }

  /* ---------- create assessment ---------- */
  protected readonly cf = signal<{ title: string; skillId: string; courseId: string; pass: number; minutes: number; questions: Question[] } | null>(null);
  private blankQ(): Question {
    return { q: '', options: ['', '', '', ''], answer: 0, why: '' };
  }
  protected openCreate() {
    this.err.set('');
    this.cf.set({ title: '', skillId: 'hi', courseId: 'C-109', pass: 80, minutes: 10, questions: [this.blankQ(), this.blankQ()] });
  }
  protected editQ(i: number, p: Partial<Question>) {
    const f = this.cf()!;
    this.cf.set({ ...f, questions: f.questions.map((q, k) => (k === i ? { ...q, ...p } : q)) });
  }
  protected editOpt(i: number, o: number, v: string) {
    const q = this.cf()!.questions[i];
    this.editQ(i, { options: q.options.map((x, k) => (k === o ? v : x)) });
  }
  protected addQ() {
    const f = this.cf()!;
    this.cf.set({ ...f, questions: [...f.questions, this.blankQ()] });
  }
  protected removeQ(i: number) {
    const f = this.cf()!;
    this.cf.set({ ...f, questions: f.questions.filter((_, k) => k !== i) });
  }
  protected saveCreate() {
    const f = this.cf()!;
    if (!f.title.trim()) return this.err.set('Give the assessment a title.');
    const qs = f.questions.filter((q) => q.q.trim() && q.options.filter((o) => o.trim()).length >= 2);
    if (!qs.length) return this.err.set('Add at least one question with two or more options.');
    const id = `Q-${500 + this.store.quizzes().length}`;
    this.store.quizzes.update((l) => [...l, { id, title: f.title.trim(), skillId: f.skillId, courseId: f.courseId, pass: f.pass, minutes: f.minutes, questions: qs.map((q) => ({ ...q, options: q.options.map((o, i) => o.trim() || `Option ${'ABCD'[i]}`), why: q.why || 'See course material.' })) }]);
    this.cf.set(null);
    this.tab.set('Assessment Bank');
    this.focus.set(id);
    this.msg(`${f.title} published to the assessment bank (${qs.length} questions)`);
  }
}
