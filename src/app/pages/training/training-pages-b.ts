import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { certTag, TrnPage } from './training-ui';
import {
  Cert, CERT_TYPES, certStatus, COMPLETION_TREND, COMPLIANCE_TREND, CT, daysUntil, DEPT_COUNT, DEPTS, downloadCsv, HOURS_BY_MONTH, iso, MONTHS_12, PEOPLE, PERSON, PracticalEval, Quiz, QUIZZES, Req, REQS, SITES, TOTAL_EMPLOYEES,
} from './training.data';

const HEAD = { parent: 'Training, Skills & Compliance' };

/* =====================================================================
   Compliance Tracking
   ===================================================================== */
@Component({
  selector: 'app-training-compliance-tracking',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Compliance Tracking" [parent]="h.parent" [parentLink]="base" subtitle="Mandatory training and certification compliance against regulations, by requirement, department and site.">
      <button class="btn-primary" (click)="auditPack()"><app-icon name="file-check" [size]="16" />Generate Audit Pack</button>
      <button class="btn-ghost" (click)="remindAll()"><app-icon name="training-send" [size]="16" />Remind Non-Compliant</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Overall Compliance" [value]="k().pct + '%'" icon="shield-check" color="var(--ka-7c3aed)" change="1.2%" sub="vs. last month" />
      <app-kpi label="Compliant Records" [value]="fmt(k().ok)" icon="training-check" color="var(--ka-22c55e)" [sub]="'of ' + fmt(k().req) + ' required'" />
      <app-kpi label="Non-Compliant" [value]="fmt(k().bad)" icon="triangle-alert" color="var(--ka-ef4444)" change="8%" [up]="false" sub="vs. last month" />
      <app-kpi label="Requirements Tracked" [value]="reqs().length" icon="file-text" color="var(--ka-3b82f6)" [sub]="reqs().filter(atRisk).length + ' below 95% target'" subColor="var(--ka-dc2626)" />
      <app-kpi label="Next External Audit" value="ISO 45001" icon="calendar-days" color="var(--ka-f59e0b)" [sub]="'in ' + 24 + ' days · ' + fd(auditDate)" />
    </section>

    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Requirements</h3>
          <div class="tabs">@for (t of ['All', 'At risk', 'On target']; track t) {<button [class.on]="rf() === t" (click)="rf.set(t)">{{ t }}</button>}</div></div>
        <table class="table rq">
          <thead><tr><th>Requirement</th><th>Regulation</th><th class="num">Required</th><th>Compliance</th><th>Status</th></tr></thead>
          <tbody>
            @for (r of shown(); track r.id) {
              <tr [class.on]="selId() === r.id" (click)="selId.set(r.id)">
                <td><b>{{ r.name }}</b><small>{{ r.appliesTo }} · {{ r.frequency }} · owner {{ r.owner }}</small></td><td>{{ r.regulation }}</td><td class="num">{{ fmt(r.required) }}</td>
                <td><span class="bar"><i [style.width.%]="r.pct" [style.background]="color(r.pct)"></i></span><b class="pv">{{ r.pct }}%</b></td>
                <td><span [class]="r.pct >= 95 ? 'tag green' : r.pct >= 90 ? 'tag amber' : 'tag red'">{{ r.pct >= 95 ? 'On target' : r.pct >= 90 ? 'At risk' : 'Breach' }}</span></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card span-4">
        @if (sel(); as r) {
          <div class="card-head"><h3>{{ r.name }}</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <p class="muted sm">{{ r.regulation }} · {{ r.appliesTo }} · {{ r.bad }} non-compliant</p>
          <app-ring [value]="r.pct" [color]="color(r.pct)" [size]="86" />
          <h4>Non-compliant employees</h4>
          <ul class="nc">
            @for (c of gapsOf(r); track c.id) {
              @let p = person(c.empId);
              <li><span class="dt-av" [style.background]="p.avatar">{{ p.initials }}</span><div><b>{{ p.name }}</b><small>{{ p.dept }} · expired {{ fd(c.expiry) }}</small></div>
                <button class="btn-ghost sm" (click)="fix(c)">Renew</button></li>
            } @empty {<li class="muted">{{ r.typeId ? 'No expired certificates.' : r.missing + ' employees have not acknowledged yet.' }}</li>}
          </ul>
          <div class="form-actions"><button class="btn-ghost" (click)="remind(r)">Send reminders</button><button class="btn-primary" (click)="enrollAll(r)">Enroll all</button></div>
        } @else {
          <h3>Compliance Trend</h3>
          <app-line-chart [labels]="months" [series]="trend" [height]="210" [min]="80" suffix="%" />
          <h3 class="mt">By Site</h3>
          <app-bar-list [rows]="bySite()" />
        }
      </div>
      <div class="card span-12">
        <div class="card-head"><h3>Compliance Heatmap · Department × Requirement</h3><span class="muted">% compliant</span></div>
        <app-heatmap [rows]="depts" [cols]="heatCols" [data]="heat()" />
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .rq tbody tr { cursor: pointer; } .rq tr.on td { background: var(--kb-f5f1ff); } .rq small { display: block; color: var(--muted); font-size: 11px; }
    .bar { display: inline-block; width: 70px; height: 6px; background: var(--kb-eef0f6); border-radius: 4px; overflow: hidden; vertical-align: middle; } .bar i { display: block; height: 100%; }
    .pv { margin-left: 8px; font-size: 12px; } .sm { font-size: 12px; } h4 { margin: 12px 0 6px; font-size: 13px; } .mt { margin-top: 16px; }
    .nc { list-style: none; margin: 0; padding: 0; max-height: 300px; overflow: auto; } .nc li { display: flex; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12px; }
    .nc li div { display: flex; flex-direction: column; flex: 1; } .nc small { color: var(--muted); font-size: 11px; }
  `,
})
export class ComplianceTracking extends TrnPage {
  protected readonly h = HEAD;
  protected readonly months = MONTHS_12;
  protected readonly depts = DEPTS;
  protected readonly auditDate = iso(24);
  protected readonly heatCols = REQS.map((r) => r.name.split(' ')[0]);
  protected readonly trend = [{ name: 'Compliance', color: 'var(--ka-7c3aed)', values: COMPLIANCE_TREND, area: true }, { name: 'Target', color: 'var(--ka-22c55e)', values: COMPLIANCE_TREND.map(() => 95), dashed: true }];
  protected readonly rf = signal('All');
  protected readonly selId = signal<string | null>(null);
  protected readonly atRisk = (r: { pct: number }) => r.pct < 95;
  protected readonly reqs = computed(() => {
    const expired = new Map<string, number>();
    for (const c of this.store.certs()) if (certStatus(c) === 'Expired' || certStatus(c) === 'Revoked') expired.set(c.typeId, (expired.get(c.typeId) ?? 0) + 1);
    return REQS.map((r) => {
      const bad = r.missing + (r.typeId ? expired.get(r.typeId) ?? 0 : 0);
      return { ...r, bad, pct: Math.round(((r.required - bad) / r.required) * 1000) / 10 };
    });
  });
  protected readonly k = computed(() => {
    const req = this.reqs().reduce((a, r) => a + r.required, 0);
    const bad = this.reqs().reduce((a, r) => a + r.bad, 0);
    return { req, bad, ok: req - bad, pct: Math.round(((req - bad) / req) * 1000) / 10 };
  });
  protected readonly shown = computed(() => this.reqs().filter((r) => this.rf() === 'All' || (this.rf() === 'At risk' ? r.pct < 95 : r.pct >= 95)));
  protected readonly sel = computed(() => this.reqs().find((r) => r.id === this.selId()) ?? null);
  protected readonly bySite = computed(() => SITES.map((s, i) => ({ label: s, value: Math.min(99.5, this.k().pct + [0.8, -1.6, -2.4, 0.3, 1.4, 2.1][i]), display: `${(Math.min(99.5, this.k().pct + [0.8, -1.6, -2.4, 0.3, 1.4, 2.1][i])).toFixed(1)}%`, color: 'var(--ka-7c3aed)' })));
  protected readonly heat = computed(() => DEPTS.map((d, di) => this.reqs().map((r, ri) => Math.max(70, Math.min(100, Math.round(r.pct + ((di * 7 + ri * 5) % 9) - 4))))));
  protected color(p: number) {
    return p >= 95 ? 'var(--ka-22c55e)' : p >= 90 ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)';
  }
  protected gapsOf(r: Req) {
    return r.typeId ? this.store.certs().filter((c) => c.typeId === r.typeId && (certStatus(c) === 'Expired' || certStatus(c) === 'Revoked')) : [];
  }
  protected fix(c: Cert) {
    this.store.renew(c.id);
    this.msg(`${CT.get(c.typeId)?.name} renewed for ${this.person(c.empId).name} · compliance updated`);
  }
  protected remind(r: Req) {
    const l = this.gapsOf(r);
    this.store.remind(l.map((c) => c.id));
    this.msg(`Reminders sent to ${l.length || r.missing} employees for “${r.name}”`);
  }
  protected enrollAll(r: Req) {
    const n = this.store.enroll(this.gapsOf(r).map((c) => c.empId), r.courseId, iso(14), 'Compliance');
    this.msg(`${n} enrolments created in ${this.course(r.courseId)?.title}`);
  }
  protected remindAll() {
    this.msg(`Reminders sent to ${fmtN(this.k().bad)} non-compliant records and their managers`);
  }
  protected auditPack() {
    downloadCsv('compliance-audit-pack.csv', [['Requirement', 'Regulation', 'Applies To', 'Required', 'Non-Compliant', 'Compliance %', 'Frequency', 'Owner'], ...this.reqs().map((r) => [r.name, r.regulation, r.appliesTo, r.required, r.bad, r.pct, r.frequency, r.owner])]);
    this.msg('Audit pack exported');
  }
}
const fmtN = (n: number) => n.toLocaleString('en-US');

/* =====================================================================
   Assessments & Evaluations (with take-quiz flow)
   ===================================================================== */
@Component({
  selector: 'app-training-assessments-evaluations',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Assessments & Evaluations" [parent]="h.parent" [parentLink]="base" subtitle="Knowledge quizzes, practical evaluations and results that feed the skills matrix.">
      <label class="as">Taking as
        <select class="select" [value]="asEmp()" (change)="asEmp.set($any($event.target).value)">@for (e of store.emps(); track e.id) {<option [value]="e.id">{{ e.name }} · {{ e.role }}</option>}</select></label>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Active Assessments" [value]="quizzes.length + store.evals().length" icon="training-quiz" color="var(--ka-7c3aed)" [sub]="quizzes.length + ' quizzes · ' + store.evals().length + ' practical'" />
      <app-kpi label="Attempts (30 days)" [value]="store.attempts().length" icon="activity" color="var(--ka-3b82f6)" [sub]="(3 + app.wobble('trn-q', 2)) + ' in progress now'" subColor="var(--ka-2563eb)" />
      <app-kpi label="Average Score" [value]="k().avg + '%'" icon="training-target" color="var(--ka-f59e0b)" change="3%" sub="vs. last month" />
      <app-kpi label="Pass Rate" [value]="k().pass + '%'" icon="training-check" color="var(--ka-22c55e)" change="5%" sub="vs. last month" />
      <app-kpi label="Pending Evaluations" [value]="k().pending" icon="clock" color="var(--ka-ef4444)" sub="practical, by supervisors" subColor="var(--ka-dc2626)" />
    </section>

    <section class="card">
      <div class="tabs tb">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>}</div>
      @switch (tab()) {
        @case ('Quizzes') {
          <div class="qg">
            @for (q of quizzes; track q.id) {
              @let s = store.skillById().get(q.skillId);
              @let best = bestOf(q.id);
              <article class="qc">
                <span class="qi" [style.background]="s?.color"><app-icon [name]="s?.icon ?? 'training-quiz'" [size]="20" /></span>
                <h4>{{ q.title }}</h4>
                <small class="muted">{{ q.questions.length }} questions · {{ q.minutes }} min · pass {{ q.pass }}%</small>
                <div class="qs"><span>{{ attemptsOf(q.id) }} attempts</span><span>avg {{ avgOf(q.id) }}%</span></div>
                @if (best !== null) {<span [class]="best >= q.pass ? 'tag green' : 'tag red'">Your best: {{ best }}%</span>} @else {<span class="tag grey">Not attempted</span>}
                <button class="btn-primary" (click)="start(q)"><app-icon name="play" [size]="14" />Take Quiz</button>
              </article>
            }
          </div>
        }
        @case ('Practical Evaluations') {
          <table class="table">
            <thead><tr><th>Employee</th><th>Skill</th><th>Assessor</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (e of store.evals(); track e.id) {
                @let p = person(e.empId);
                <tr><td><div class="dt-person"><span class="dt-av" [style.background]="p.avatar">{{ p.initials }}</span><div><b>{{ p.name }}</b><small>{{ p.role }}</small></div></div></td>
                  <td>{{ store.skillById().get(e.skillId)?.name }}</td><td>{{ e.assessor }}</td><td>{{ fd(e.due) }}</td>
                  <td>@if (e.status === 'Completed') {<span class="tag green">Rated {{ e.rating }}/5</span>} @else {<span [class]="days(e.due) <= 2 ? 'tag red' : 'tag amber'">Pending · {{ days(e.due) }}d</span>}</td>
                  <td>@if (e.status === 'Pending') {<button class="btn-ghost sm" (click)="openEval(e)">Evaluate</button>}</td></tr>
              }
            </tbody>
          </table>
        }
        @case ('Results') {
          <app-data-table [rows]="results()" [columns]="cols" [filters]="filters" [searchKeys]="['name', 'quiz']" noun="attempts" />
        }
      }
    </section>

    <!-- quiz flow -->
    @if (quiz(); as q) {
      <div class="g-overlay"></div>
      <div class="g-modal quiz">
        <div class="modal-head"><h3>{{ q.title }}</h3><button class="close-btn" (click)="quiz.set(null)">×</button></div>
        @switch (stage()) {
          @case ('intro') {
            <p>{{ q.questions.length }} questions · pass mark {{ q.pass }}% · about {{ q.minutes }} minutes.</p>
            <p class="muted">Taking as <b>{{ asName() }}</b>. Passing updates the {{ store.skillById().get(q.skillId)?.name }} level in the skills matrix.</p>
            <div class="form-actions"><button class="btn-ghost" (click)="quiz.set(null)">Cancel</button><button class="btn-primary" (click)="stage.set('q')">Start</button></div>
          }
          @case ('q') {
            @let qq = q.questions[idx()];
            <div class="qp"><span>Question {{ idx() + 1 }} of {{ q.questions.length }}</span><span class="bar"><i [style.width.%]="((idx() + 1) / q.questions.length) * 100"></i></span><span>{{ elapsed() }}</span></div>
            <h4 class="qt">{{ qq.q }}</h4>
            <div class="opts">
              @for (o of qq.options; track $index) {
                <button [class.on]="answers()[idx()] === $index" (click)="answer($index)"><em>{{ 'ABCD'[$index] }}</em>{{ o }}</button>
              }
            </div>
            <div class="form-actions">
              <button class="btn-ghost" [disabled]="idx() === 0" (click)="idx.set(idx() - 1)">Back</button>
              @if (idx() < q.questions.length - 1) {<button class="btn-primary" [disabled]="answers()[idx()] === undefined" (click)="idx.set(idx() + 1)">Next</button>}
              @else {<button class="btn-primary" [disabled]="answered() < q.questions.length" (click)="submit(q)">Submit</button>}
            </div>
          }
          @case ('done') {
            @let sc = score(q);
            <div class="res" [class.pass]="sc >= q.pass">
              <app-ring [value]="sc" [color]="sc >= q.pass ? 'var(--ka-22c55e)' : 'var(--ka-ef4444)'" [size]="96" />
              <div><h3>{{ sc >= q.pass ? 'Passed' : 'Not passed' }}</h3><p class="muted">{{ correct(q) }} of {{ q.questions.length }} correct · pass mark {{ q.pass }}%</p>
                @if (sc >= q.pass) {<p class="good">Skill level updated for {{ asName() }}.</p>} @else {<p class="bad">A retake is available. Refresher course suggested.</p>}</div>
            </div>
            <ul class="rev">
              @for (qq of q.questions; track $index; let i = $index) {
                <li [class.ok]="answers()[i] === qq.answer"><b>{{ i + 1 }}. {{ qq.q }}</b><small>Your answer: {{ qq.options[answers()[i]!] }} @if (answers()[i] !== qq.answer) {· Correct: {{ qq.options[qq.answer] }}}</small><small class="why">{{ qq.why }}</small></li>
              }
            </ul>
            <div class="form-actions"><button class="btn-ghost" (click)="start(q)">Retake</button><button class="btn-primary" (click)="quiz.set(null); tab.set('Results')">View results</button></div>
          }
        }
      </div>
    }

    @if (ev(); as e) {
      <div class="g-overlay" (click)="ev.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveEval(e)">
        <div class="modal-head"><h3>Practical Evaluation · {{ person(e.empId).name }}</h3><button type="button" class="close-btn" (click)="ev.set(null)">×</button></div>
        <p class="muted">{{ store.skillById().get(e.skillId)?.name }} · assessor {{ e.assessor }}</p>
        @for (c of criteria; track c; let i = $index) {
          <div class="crit"><span>{{ c }}</span><div>@for (n of [1, 2, 3, 4, 5]; track n) {<button type="button" [class.on]="rub()[i] === n" (click)="rate(i, n)">{{ n }}</button>}</div></div>
        }
        <p>Overall: <b>{{ rubAvg() }} / 5</b> → skill level {{ rubAvg() }}</p>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="ev.set(null)">Cancel</button><button class="btn-primary" type="submit">Submit Evaluation</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .as { display: flex; align-items: center; gap: 8px; font-size: 12.5px; } .tb { margin-bottom: 14px; }
    .qg { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .qc { border: 1px solid var(--border); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 7px; align-items: flex-start; } .qc h4 { margin: 0; font-size: 14px; }
    .qc .btn-primary { margin-top: auto; align-self: stretch; justify-content: center; }
    .qi { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .qs { display: flex; gap: 12px; font-size: 12px; color: var(--kf-4b4f6b); }
    .quiz { width: min(680px, calc(100vw - 32px)); }
    .qp { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--muted); } .qp .bar { flex: 1; height: 6px; background: var(--kb-eef0f6); border-radius: 4px; overflow: hidden; } .qp .bar i { display: block; height: 100%; background: var(--primary); }
    .qt { font-size: 16px; margin: 16px 0; }
    .opts { display: flex; flex-direction: column; gap: 8px; } .opts button { display: flex; align-items: center; gap: 10px; text-align: left; padding: 11px 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--kb-ffffff); cursor: pointer; font: inherit; font-size: 13px; }
    .opts button.on { border-color: var(--primary); background: var(--kb-f5f1ff); } .opts em { font-style: normal; width: 24px; height: 24px; border-radius: 50%; background: var(--kb-f1f2f7); display: grid; place-items: center; font-weight: 700; font-size: 12px; } .opts button.on em { background: var(--primary); color: var(--kf-ffffff); }
    .res { display: flex; gap: 18px; align-items: center; padding: 12px; border-radius: 10px; background: var(--kb-fef2f2); } .res.pass { background: var(--kb-f0fdf4); } .res h3 { font-size: 20px; } .res p { margin: 4px 0; }
    .rev { list-style: none; padding: 0; margin: 12px 0 0; max-height: 40vh; overflow: auto; } .rev li { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-left: 3px solid var(--kl-ef4444); margin-bottom: 6px; background: var(--kb-fafafe); font-size: 12.5px; }
    .rev li.ok { border-left-color: var(--kl-22c55e); } .rev small { color: var(--kf-4b4f6b); } .rev .why { color: var(--muted); font-style: italic; }
    .crit { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 13px; } .crit div { display: flex; gap: 4px; }
    .crit button { width: 30px; height: 30px; border: 1px solid var(--border); border-radius: 6px; background: var(--kb-ffffff); cursor: pointer; } .crit button.on { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); }
  `,
})
export class AssessmentsEvaluations extends TrnPage {
  protected readonly h = HEAD;
  protected readonly quizzes = QUIZZES;
  protected readonly tabs = ['Quizzes', 'Practical Evaluations', 'Results'];
  protected readonly criteria = ['Pre-task checks & PPE', 'Correct procedure followed', 'Hazard awareness', 'Communication & reporting', 'Equipment / tool handling'];
  protected readonly tab = signal('Quizzes');
  protected readonly asEmp = signal('EMP-001');
  protected readonly asName = computed(() => this.store.empById().get(this.asEmp())?.name ?? '');
  protected readonly k = computed(() => {
    const a = this.store.attempts();
    return { avg: Math.round(a.reduce((s, x) => s + x.score, 0) / (a.length || 1)), pass: Math.round((a.filter((x) => x.passed).length / (a.length || 1)) * 100), pending: this.store.evals().filter((e) => e.status === 'Pending').length };
  });
  protected attemptsOf(id: string) {
    return this.store.attempts().filter((a) => a.quizId === id).length;
  }
  protected avgOf(id: string) {
    const l = this.store.attempts().filter((a) => a.quizId === id);
    return Math.round(l.reduce((s, x) => s + x.score, 0) / (l.length || 1));
  }
  protected bestOf(id: string) {
    const l = this.store.attempts().filter((a) => a.quizId === id && a.empId === this.asEmp());
    return l.length ? Math.max(...l.map((a) => a.score)) : null;
  }
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'quiz', label: 'Assessment' },
    { key: 'at', label: 'Date', fmt: (v) => this.fd(v) },
    { key: 'mins', label: 'Time (min)', kind: 'num' },
    { key: 'score', label: 'Score', kind: 'progress' },
    { key: 'result', label: 'Result', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'quiz', label: 'Assessment', options: QUIZZES.map((q) => q.title) }, { key: 'result', label: 'Result', options: ['Passed', 'Failed'] }];
  protected readonly results = computed(() =>
    this.store.attempts().map((a) => {
      const p = this.person(a.empId);
      return { ...a, name: p.name, initials: p.initials, avatar: p.avatar, quiz: QUIZZES.find((q) => q.id === a.quizId)?.title, result: a.passed ? 'Passed' : 'Failed' };
    }),
  );

  // quiz flow
  protected readonly quiz = signal<Quiz | null>(null);
  protected readonly stage = signal<'intro' | 'q' | 'done'>('intro');
  protected readonly idx = signal(0);
  protected readonly answers = signal<(number | undefined)[]>([]);
  private startedAt = 0;
  protected readonly elapsed = computed(() => {
    this.app.tick();
    const s = Math.floor((Date.now() - this.startedAt) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  protected readonly answered = computed(() => this.answers().filter((a) => a !== undefined).length);
  protected start(q: Quiz) {
    this.quiz.set(q);
    this.stage.set('intro');
    this.idx.set(0);
    this.answers.set([]);
    this.startedAt = Date.now();
  }
  protected answer(i: number) {
    const a = [...this.answers()];
    a[this.idx()] = i;
    this.answers.set(a);
  }
  protected correct(q: Quiz) {
    return q.questions.filter((x, i) => this.answers()[i] === x.answer).length;
  }
  protected score(q: Quiz) {
    return Math.round((this.correct(q) / q.questions.length) * 100);
  }
  protected submit(q: Quiz) {
    const sc = this.score(q);
    const passed = sc >= q.pass;
    this.store.attempts.update((l) => [{ id: `ATT-${7001 + l.length}`, quizId: q.id, empId: this.asEmp(), score: sc, passed, at: iso(0), mins: Math.max(1, Math.round((Date.now() - this.startedAt) / 60000)) }, ...l]);
    const e = this.store.empById().get(this.asEmp());
    if (passed && e) {
      const cur = e.levels[q.skillId] ?? 0;
      const lvl = Math.max(cur, sc === 100 ? 4 : 3);
      if (lvl !== cur) this.store.setLevel(e.id, q.skillId, lvl, `raised after passing quiz (${sc}%)`);
      else this.store.addLog(`Passed ${q.title} (${sc}%)`, e.id, 'System');
    } else if (e) this.store.addLog(`Attempted ${q.title} (${sc}%) – not passed`, e.id, 'System');
    this.stage.set('done');
  }

  // practical evaluation
  protected readonly ev = signal<PracticalEval | null>(null);
  protected readonly rub = signal<number[]>([3, 3, 3, 3, 3]);
  protected readonly rubAvg = computed(() => Math.round(this.rub().reduce((a, x) => a + x, 0) / this.rub().length));
  protected openEval(e: PracticalEval) {
    this.rub.set([3, 3, 3, 3, 3]);
    this.ev.set(e);
  }
  protected rate(i: number, n: number) {
    const r = [...this.rub()];
    r[i] = n;
    this.rub.set(r);
  }
  protected saveEval(e: PracticalEval) {
    const lvl = this.rubAvg();
    this.store.evals.update((l) => l.map((x) => (x.id === e.id ? { ...x, status: 'Completed', rating: lvl } : x)));
    this.store.setLevel(e.empId, e.skillId, lvl, `assessed by ${e.assessor}`);
    this.ev.set(null);
    this.msg(`${this.person(e.empId).name} rated ${lvl}/5 · skills matrix updated`);
  }
}

/* =====================================================================
   Renewals & Expiry Alerts
   ===================================================================== */
@Component({
  selector: 'app-training-renewals-expiry-alerts',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Renewals & Expiry Alerts" [parent]="h.parent" [parentLink]="base" subtitle="Upcoming certificate expiries, automated reminders and renewal scheduling.">
      <button class="btn-primary" (click)="remindWindow()"><app-icon name="training-send" [size]="16" />Send All Reminders</button>
      <button class="btn-ghost" (click)="rulesOpen.set(true)"><app-icon name="settings" [size]="16" />Alert Rules</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Expired" [value]="b().expired" icon="triangle-alert" color="var(--ka-ef4444)" sub="renew immediately" subColor="var(--ka-dc2626)" />
      <app-kpi label="Due in 7 days" [value]="b().d7" icon="bell-ring" color="var(--ka-f97316)" sub="critical" subColor="var(--ka-ea580c)" />
      <app-kpi label="Due for Training" [value]="b().d30" icon="graduation-cap" color="var(--ka-3b82f6)" change="28%" sub="within 30 days" />
      <app-kpi label="Due in 31–90 days" [value]="b().d90" icon="calendar-days" color="var(--ka-7c3aed)" sub="plan sessions" />
      <app-kpi label="Renewals Booked" [value]="booked()" icon="training-repeat" color="var(--ka-22c55e)" sub="auto + manual enrolments" />
    </section>

    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Expiry Alerts</h3>
          <div class="tabs">@for (w of windows; track w.k) {<button [class.on]="win() === w.k" (click)="win.set(w.k)">{{ w.k }}<span class="count">{{ countW(w) }}</span></button>}</div></div>
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" [searchKeys]="['name', 'cert', 'empId']" searchPlaceholder="Search employee or certificate..." noun="alerts"
          (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
      </div>
      <div class="card span-4">
        <h3>Expiry Timeline</h3>
        <app-column-chart [labels]="tl().labels" [series]="tl().series" [height]="210" [legend]="false" />
        <h3 class="mt">Due by Certificate (30 days)</h3>
        <ul class="dg">
          @for (g of store.dueGroups(); track g.type.id) {
            <li><span>{{ g.type.name }}</span><b>{{ g.count }}</b><em [class]="g.window <= 14 ? 'red' : g.window <= 21 ? 'orange' : 'blue'">In {{ g.window }} days</em><button class="link" (click)="book(g.type.id)">Book</button></li>
          }
        </ul>
      </div>
    </section>

    @if (rulesOpen()) {
      <div class="g-overlay" (click)="rulesOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Alert Rules</h3><button class="close-btn" (click)="rulesOpen.set(false)">×</button></div>
        @for (r of rules(); track r.k; let i = $index) {
          <label class="rule"><span><b>{{ r.k }}</b><small>{{ r.d }}</small></span><input type="checkbox" [checked]="r.on" (change)="toggleRule(i)" /></label>
        }
        <h4>Channels</h4>
        <div class="ch">@for (c of channels(); track c.k; let i = $index) {<label><input type="checkbox" [checked]="c.on" (change)="toggleCh(i)" />{{ c.k }}</label>}</div>
        <div class="form-actions"><button class="btn-primary" (click)="rulesOpen.set(false); msg('Alert rules saved')">Save Rules</button></div>
      </div>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .mt { margin-top: 16px; } h3 { margin-bottom: 8px; }
    .dg { list-style: none; margin: 0; padding: 0; max-height: 330px; overflow: auto; } .dg li { display: grid; grid-template-columns: 1fr 28px 74px 36px; gap: 8px; align-items: center; font-size: 12px; padding: 5px 0; border-bottom: 1px solid var(--kl-f3f4f8); }
    .dg b { text-align: right; } .dg em { font-style: normal; font-size: 11px; text-align: center; padding: 2px 0; border-radius: 4px; }
    .dg em.red { background: var(--kb-fee2e2); color: var(--kf-dc2626); } .dg em.orange { background: var(--kb-ffedd5); color: var(--kf-ea580c); } .dg em.blue { background: var(--kb-dbeafe); color: var(--kf-2563eb); }
    .rule { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--kl-f0f1f6); } .rule span { display: flex; flex-direction: column; font-size: 13px; } .rule small { color: var(--muted); font-size: 11.5px; }
    .rule input { width: 18px; height: 18px; accent-color: var(--primary); } h4 { margin: 14px 0 8px; } .ch { display: flex; gap: 16px; font-size: 13px; } .ch label { display: flex; gap: 6px; align-items: center; }
  `,
})
export class RenewalsExpiryAlerts extends TrnPage {
  protected readonly h = HEAD;
  protected readonly windows = [
    { k: 'Expired', lo: -9999, hi: -1 }, { k: '≤ 7 days', lo: 0, hi: 7 }, { k: '≤ 30 days', lo: 0, hi: 30 }, { k: '31–90 days', lo: 31, hi: 90 },
  ];
  protected readonly win = signal('≤ 30 days');
  protected readonly rulesOpen = signal(false);
  protected readonly rules = signal([
    { k: '90 days before expiry', d: 'Notify employee', on: true }, { k: '60 days before expiry', d: 'Notify employee + auto-enroll in renewal course', on: true },
    { k: '30 days before expiry', d: 'Notify employee and line manager', on: true }, { k: '7 days before expiry', d: 'Escalate to HSE manager', on: true }, { k: 'On expiry', d: 'Suspend site access permit for licence-dependent roles', on: false },
  ]);
  protected readonly channels = signal([{ k: 'Email', on: true }, { k: 'SMS', on: false }, { k: 'Push (ESS app)', on: true }, { k: 'Teams', on: true }]);
  private readonly live = computed(() => this.store.certs().filter((c) => !c.revoked).map((c) => ({ c, d: daysUntil(c.expiry) })));
  protected readonly b = computed(() => {
    const l = this.live();
    return { expired: l.filter((x) => x.d < 0).length, d7: l.filter((x) => x.d >= 0 && x.d <= 7).length, d30: l.filter((x) => x.d >= 0 && x.d <= 30).length, d90: l.filter((x) => x.d > 30 && x.d <= 90).length };
  });
  protected readonly booked = computed(() => this.store.enrollments().filter((e) => e.source === 'Auto (Renewal)' && e.status !== 'Completed').length);
  protected countW(w: { lo: number; hi: number }) {
    return this.live().filter((x) => x.d >= w.lo && x.d <= w.hi).length;
  }
  protected readonly rows = computed(() => {
    const w = this.windows.find((x) => x.k === this.win())!;
    const enrolled = new Set(this.store.enrollments().filter((e) => e.status !== 'Completed').map((e) => `${e.empId}|${e.courseId}`));
    return this.live()
      .filter((x) => x.d >= w.lo && x.d <= w.hi)
      .sort((a, b) => a.d - b.d)
      .map(({ c, d }) => {
        const p = this.person(c.empId);
        const t = CT.get(c.typeId)!;
        return { ...c, name: p.name, initials: p.initials, avatar: p.avatar, dept: p.dept, cert: t.name, left: d, severity: d < 0 ? 'Expired' : d <= 7 ? 'Critical' : d <= 30 ? 'Warning' : 'Scheduled', renewal: enrolled.has(`${c.empId}|${t.courseId}`) ? 'Booked' : 'Not booked', rem: c.reminded ?? 0 };
      });
  });
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'dept' },
    { key: 'cert', label: 'Certificate' },
    { key: 'expiry', label: 'Expiry', fmt: (v) => this.fd(v) },
    { key: 'left', label: 'Days', fmt: (v) => (v < 0 ? `${-v} ago` : `${v}`) },
    { key: 'severity', label: 'Severity', kind: 'tag', tag: (r) => (r.severity === 'Expired' || r.severity === 'Critical' ? 'tag red' : r.severity === 'Warning' ? 'tag amber' : 'tag blue') },
    { key: 'renewal', label: 'Renewal', kind: 'tag', tag: (r) => (r.renewal === 'Booked' ? 'tag green' : 'tag grey') },
    { key: 'rem', label: 'Reminders', kind: 'num' },
  ];
  protected readonly filters = [{ key: 'cert', label: 'Certificate', options: CERT_TYPES.map((t) => t.name) }, { key: 'dept', label: 'Department', options: DEPTS }, { key: 'renewal', label: 'Renewal', options: ['Booked', 'Not booked'] }];
  protected readonly actions: RowAction[] = [
    { id: 'remind', label: 'Send reminder', icon: 'training-send' },
    { id: 'book', label: 'Book renewal course', icon: 'graduation-cap', when: (r) => r.renewal !== 'Booked' },
    { id: 'renew', label: 'Mark renewed', icon: 'training-repeat' },
    { id: 'snooze', label: 'Snooze 7 days', icon: 'training-snooze' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'remind', label: 'Send reminders' }, { id: 'book', label: 'Book renewals' }, { id: 'export', label: 'Export' }];
  protected readonly tl = computed(() => {
    const buckets = [['Expired', -9999, -1], ['0–7', 0, 7], ['8–14', 8, 14], ['15–21', 15, 21], ['22–30', 22, 30], ['31–60', 31, 60], ['61–90', 61, 90]] as const;
    const l = this.live();
    return { labels: buckets.map((b) => b[0] as string), series: [{ name: 'Certificates', color: 'var(--ka-7c3aed)', values: buckets.map(([, lo, hi]) => l.filter((x) => x.d >= lo && x.d <= hi).length) }] };
  });
  protected act(a: string, r: Cert & { name: string }) {
    if (a === 'remind') this.store.remind([r.id]);
    if (a === 'book') this.store.enroll([r.empId], CT.get(r.typeId)!.courseId, r.expiry < iso(0) ? iso(14) : r.expiry, 'Auto (Renewal)');
    if (a === 'renew') this.store.renew(r.id);
    if (a === 'snooze') this.store.patchCert(r.id, { snoozed: true });
    this.msg(a === 'remind' ? `Reminder sent to ${r.name}` : a === 'book' ? `Renewal course booked for ${r.name}` : a === 'renew' ? `${r.name}'s certificate renewed` : `Alert snoozed for 7 days`);
  }
  protected bulkAct(a: string, ids: string[]) {
    const rows = this.rows().filter((r) => ids.includes(r.id));
    if (a === 'export') return downloadCsv('expiry-alerts.csv', [['Employee', 'Certificate', 'Expiry', 'Days', 'Severity', 'Renewal'], ...rows.map((r) => [r.name, r.cert, r.expiry, r.left, r.severity, r.renewal])]);
    if (a === 'book') rows.forEach((r) => this.store.enroll([r.empId], CT.get(r.typeId)!.courseId, r.expiry < iso(0) ? iso(14) : r.expiry, 'Auto (Renewal)'));
    else this.store.remind(ids);
    this.msg(a === 'book' ? `${rows.length} renewals booked` : `Reminders sent for ${ids.length} alerts`);
  }
  protected book(typeId: string) {
    const t = CT.get(typeId)!;
    const l = this.store.dueSoon().filter((c) => c.typeId === typeId);
    const n = this.store.enroll(l.map((c) => c.empId), t.courseId, iso(14), 'Auto (Renewal)');
    this.msg(`${n} employees booked on ${this.course(t.courseId)?.title}`);
  }
  protected remindWindow() {
    const ids = this.rows().map((r) => r.id);
    this.store.remind(ids);
    this.msg(`Reminders sent for ${ids.length} certificates (${this.win()})`);
  }
  protected toggleRule(i: number) {
    this.rules.update((l) => l.map((r, k) => (k === i ? { ...r, on: !r.on } : r)));
  }
  protected toggleCh(i: number) {
    this.channels.update((l) => l.map((r, k) => (k === i ? { ...r, on: !r.on } : r)));
  }
}

/* =====================================================================
   Reports & Analytics
   ===================================================================== */
@Component({
  selector: 'app-training-reports-analytics',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Reports & Analytics" [parent]="h.parent" [parentLink]="base" subtitle="Training effort, completion, skills and compliance analytics with exportable reports.">
      <select class="select" [value]="period()" (change)="period.set($any($event.target).value)"><option>Last 12 months</option><option>Last 6 months</option><option>Last 3 months</option></select>
      <button class="btn-primary" (click)="schedOpen.set(true)"><app-icon name="calendar-days" [size]="16" />Schedule Report</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Training Hours" [value]="fmt(hours())" icon="clock" color="var(--ka-7c3aed)" change="12%" sub="vs. prior period" />
      <app-kpi label="Completion Rate" [value]="COMPLETION_TREND[11] + '%'" icon="training-check" color="var(--ka-22c55e)" change="4%" sub="vs. prior period" />
      <app-kpi label="Proficient Employees" [value]="store.proficientPct() + '%'" icon="training-target" color="var(--ka-f59e0b)" [sub]="fmt(store.bands()[0].value) + ' of ' + fmt(total)" />
      <app-kpi label="Compliance" value="92%" icon="shield-check" color="var(--ka-3b82f6)" change="1.2%" sub="vs. last month" />
      <app-kpi label="Spend / Employee" value="AED 486" icon="sparkles" color="var(--ka-0891b2)" change="3%" [up]="false" sub="vs. budget" />
    </section>

    <section class="dash">
      <div class="card span-8"><div class="card-head"><h3>Training Hours by Month</h3></div><app-column-chart [labels]="labels()" [series]="hoursSeries()" [height]="230" /></div>
      <div class="card span-4"><h3>Proficiency Bands</h3><app-donut [segments]="bands()" center="Employees" [size]="150" /></div>
      <div class="card span-6"><h3>Completion & Compliance Trend</h3><app-line-chart [labels]="labels()" [series]="trend()" [height]="220" [min]="75" suffix="%" /></div>
      <div class="card span-6"><h3>Top Skill Gaps</h3><app-bar-list [rows]="gaps()" [max]="gaps()[0]?.value || 1" /></div>
      <div class="card span-7"><h3>Skill Proficiency by Department</h3><app-heatmap [rows]="depts" [cols]="skillCols" [data]="deptHeat" /></div>
      <div class="card span-5">
        <div class="card-head"><h3>Report Library</h3></div>
        <ul class="rl">
          @for (r of reports; track r.k) {
            <li><span class="ri"><app-icon [name]="r.icon" [size]="16" /></span><div><b>{{ r.k }}</b><small>{{ r.d }}</small></div><button class="btn-ghost sm" (click)="run(r.k)"><app-icon name="download" [size]="13" />CSV</button></li>
          }
        </ul>
        @if (scheduled().length) {
          <h4>Scheduled</h4>
          <ul class="rl">@for (s of scheduled(); track $index) {<li><span class="ri g"><app-icon name="calendar-days" [size]="15" /></span><div><b>{{ s.r }}</b><small>{{ s.f }} · {{ s.to }}</small></div><button class="link" (click)="unschedule($index)">Remove</button></li>}</ul>
        }
      </div>
    </section>

    @if (schedOpen()) {
      <div class="g-overlay" (click)="schedOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); schedule()">
        <div class="modal-head"><h3>Schedule Report</h3><button type="button" class="close-btn" (click)="schedOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Report<select class="select" [value]="sf().r" (change)="sf.set({ ...sf(), r: $any($event.target).value })">@for (r of reports; track r.k) {<option>{{ r.k }}</option>}</select></label>
          <label>Frequency<select class="select" [value]="sf().f" (change)="sf.set({ ...sf(), f: $any($event.target).value })"><option>Weekly (Mon 08:00)</option><option>Monthly (1st)</option><option>Quarterly</option></select></label>
          <label>Recipients<input class="input" [value]="sf().to" (input)="sf.set({ ...sf(), to: $any($event.target).value })" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="schedOpen.set(false)">Cancel</button><button class="btn-primary" type="submit">Schedule</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    h3 { margin-bottom: 10px; } h4 { margin: 12px 0 6px; font-size: 13px; }
    .rl { list-style: none; margin: 0; padding: 0; } .rl li { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .rl li div { flex: 1; display: flex; flex-direction: column; } .rl small { color: var(--muted); font-size: 11px; }
    .ri { width: 30px; height: 30px; border-radius: 8px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; } .ri.g { background: var(--kb-dcfce7); color: var(--kf-16a34a); }
  `,
})
export class TrnReportsAnalytics extends TrnPage {
  protected readonly h = HEAD;
  protected readonly COMPLETION_TREND = COMPLETION_TREND;
  protected readonly total = TOTAL_EMPLOYEES;
  protected readonly depts = DEPTS;
  protected readonly period = signal('Last 12 months');
  private readonly n = computed(() => (this.period() === 'Last 6 months' ? 6 : this.period() === 'Last 3 months' ? 3 : 12));
  protected readonly labels = computed(() => MONTHS_12.slice(12 - this.n()));
  protected readonly hours = computed(() => HOURS_BY_MONTH.slice(12 - this.n()).reduce((a, x) => a + x, 0));
  protected readonly hoursSeries = computed(() => [
    { name: 'Safety', color: 'var(--ka-7c3aed)', values: HOURS_BY_MONTH.slice(12 - this.n()).map((v) => Math.round(v * 0.58)) },
    { name: 'Technical', color: 'var(--ka-3b82f6)', values: HOURS_BY_MONTH.slice(12 - this.n()).map((v) => Math.round(v * 0.24)) },
    { name: 'Soft Skills & Compliance', color: 'var(--ka-22c55e)', values: HOURS_BY_MONTH.slice(12 - this.n()).map((v) => Math.round(v * 0.18)) },
  ]);
  protected readonly trend = computed(() => [
    { name: 'Completion', color: 'var(--ka-7c3aed)', values: COMPLETION_TREND.slice(12 - this.n()) },
    { name: 'Compliance', color: 'var(--ka-22c55e)', values: COMPLIANCE_TREND.slice(12 - this.n()) },
  ]);
  protected readonly bands = computed(() => this.store.bands().map((b) => ({ label: b.key, value: b.value, color: b.color })));
  protected readonly gaps = computed(() => this.store.gaps().slice(0, 8).map((g) => ({ label: g.name, value: g.gaps, color: g.color })));
  protected readonly skillCols = ['First Aid', 'Fire', 'Equip.', 'Security', 'Emerg.', 'Hazard', 'Height', 'Forklift'];
  protected readonly deptHeat = DEPTS.map((d, i) => this.skillCols.map((_, j) => 52 + ((i * 13 + j * 17 + DEPT_COUNT[d]) % 44)));
  protected readonly reports = [
    { k: 'Skills Matrix Export', d: 'All matrix employees × skills with levels', icon: 'training-matrix' },
    { k: 'Certification Register', d: 'All certificates with expiry and status', icon: 'id-card' },
    { k: 'Compliance Audit Summary', d: 'Requirements, regulation and % compliant', icon: 'file-check' },
    { k: 'Enrolment Status', d: 'Every enrolment with progress and due date', icon: 'users' },
    { k: 'Assessment Results', d: 'Quiz attempts, scores and pass/fail', icon: 'training-quiz' },
  ];
  protected readonly schedOpen = signal(false);
  protected readonly sf = signal({ r: 'Compliance Audit Summary', f: 'Monthly (1st)', to: 'hse-team@people360.com' });
  protected readonly scheduled = signal<{ r: string; f: string; to: string }[]>([{ r: 'Certification Register', f: 'Weekly (Mon 08:00)', to: 'hr-ops@people360.com' }]);
  protected schedule() {
    this.scheduled.update((l) => [...l, this.sf()]);
    this.schedOpen.set(false);
    this.msg(`${this.sf().r} scheduled ${this.sf().f.toLowerCase()}`);
  }
  protected unschedule(i: number) {
    this.scheduled.update((l) => l.filter((_, k) => k !== i));
  }
  protected run(k: string) {
    const s = this.store;
    const P = (id: string) => PERSON.get(id)?.name ?? id;
    const rows: (string | number)[][] =
      k === 'Skills Matrix Export' ? [['Employee', ...s.skills().map((x) => x.name)], ...s.emps().map((e) => [e.name, ...s.skills().map((x) => e.levels[x.id] ?? 'N/A')])]
      : k === 'Certification Register' ? [['Employee', 'Certificate', 'Expiry', 'Status'], ...s.certs().map((c) => [P(c.empId), CT.get(c.typeId)!.name, c.expiry, certStatus(c)])]
      : k === 'Compliance Audit Summary' ? [['Requirement', 'Regulation', 'Required', 'Missing'], ...REQS.map((r) => [r.name, r.regulation, r.required, r.missing])]
      : k === 'Enrolment Status' ? [['Employee', 'Course', 'Status', 'Progress', 'Due'], ...s.enrollments().map((e) => [P(e.empId), s.courseById().get(e.courseId)?.title ?? '', e.status, e.progress, e.due])]
      : [['Employee', 'Quiz', 'Score', 'Passed', 'Date'], ...s.attempts().map((a) => [P(a.empId), a.quizId, a.score, a.passed ? 'Yes' : 'No', a.at])];
    downloadCsv(k.toLowerCase().replace(/ /g, '-') + '.csv', rows);
    this.msg(`${k} exported (${rows.length - 1} rows)`);
  }
}
void PEOPLE;
void certTag;
