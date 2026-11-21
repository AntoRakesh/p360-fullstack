import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { UI } from '@p360/shared/ui';
import { dayLabels, series } from '@p360/shared/data/demo-data';

type Kind = 'Anomaly' | 'Prediction' | 'Risk' | 'Opportunity';
interface Insight {
  id: number;
  kind: Kind;
  title: string;
  detail: string;
  action: string;
  confidence: number;
  impact: 'High' | 'Medium' | 'Low';
  status: 'New' | 'Accepted' | 'Dismissed';
}

const KIND_STYLE: Record<Kind, { icon: string; color: string }> = {
  Anomaly: { icon: 'activity', color: 'var(--ka-ef4444)' },
  Prediction: { icon: 'trending-up', color: 'var(--ka-3b82f6)' },
  Risk: { icon: 'triangle-alert', color: 'var(--ka-f97316)' },
  Opportunity: { icon: 'lightbulb', color: 'var(--ka-22c55e)' },
};

const INSIGHTS: Insight[] = [
  { id: 1, kind: 'Anomaly', title: 'Unusual after-hours access in Server Room', detail: '7 access attempts between 01:00–03:00 this week, 4× the 90-day baseline.', action: 'Review access rights for Server Room and enable 2-factor entry after 22:00.', confidence: 94, impact: 'High', status: 'New' },
  { id: 2, kind: 'Prediction', title: 'Head Office will hit 92% occupancy on Thursday', detail: 'Town-hall meeting plus 3 client visits forecast; canteen queue expected at 12:30.', action: 'Open overflow desks on F4 and stagger lunch slots by department.', confidence: 87, impact: 'Medium', status: 'New' },
  { id: 3, kind: 'Risk', title: '18 contractor permits expire within 7 days', detail: 'BuildRight LLC accounts for 9 of them; 4 workers are scheduled on Line 3 next week.', action: 'Send renewal reminders and block site access on expiry automatically.', confidence: 99, impact: 'High', status: 'New' },
  { id: 4, kind: 'Opportunity', title: 'Warehouse night shift overstaffed by ~11%', detail: 'Average utilization 64% on Mon–Wed nights over the last 6 weeks.', action: 'Move 6 staff from night to evening shift; estimated saving 210 OT hours/month.', confidence: 81, impact: 'Medium', status: 'New' },
  { id: 5, kind: 'Anomaly', title: 'Late arrivals up 38% in Logistics', detail: 'Spike coincides with new route closure near Gate 2 since 27 Oct.', action: 'Open Gate 3 for staff entry 07:30–09:00 and notify Logistics team.', confidence: 76, impact: 'Low', status: 'New' },
  { id: 6, kind: 'Prediction', title: 'Absence likely to rise 9% next week', detail: 'Seasonal flu pattern and 2 public holidays nearby.', action: 'Pre-approve 40 temporary staff from agency pool for Manufacturing.', confidence: 72, impact: 'Medium', status: 'New' },
  { id: 7, kind: 'Risk', title: 'Fire warden coverage below minimum on B1', detail: 'Only 2 of 3 required wardens rostered this week.', action: 'Assign 1 trained warden from G floor to B1 this week.', confidence: 97, impact: 'High', status: 'New' },
];

const ANSWERS: [RegExp, string][] = [
  [/late|arriv/i, 'Late arrivals today: 186 (1.9%). Logistics is highest at 4.1%, mostly at Gate 2 between 08:45 and 09:20.'],
  [/visitor/i, '284 visitors on site right now, 342 expected today. 7 are overstaying, 5 of them at Head Office.'],
  [/occup|capacity|bus(y|i)|crowd/i, 'Warehouse is busiest at 86% capacity. Head Office is at 78% and is forecast to peak at 92% on Thursday.'],
  [/absent|leave|sick/i, '312 absent and 421 on leave today. Unplanned absence is 0.4% above the monthly average.'],
  [/alert|security|incident/i, '14 open alerts: 3 critical (Server Room intrusion, blocked fire exit S2, panic alert in Warehouse Zone B).'],
  [/contractor|permit/i, '1,326 contractors on site from 6 companies. 18 permits expire within 7 days.'],
];

@Component({
  selector: 'app-ai-insights',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="AI Insights &amp; Recommendations" />

    <section class="kpi-row">
      <app-kpi label="New Insights" [value]="count('New')" icon="sparkles" color="var(--ka-8b5cf6)" sub="last 24 hours" />
      <app-kpi label="Accepted Actions" [value]="count('Accepted')" icon="shield-check" color="var(--ka-22c55e)" sub="this session" />
      <app-kpi label="Avg. Confidence" value="87%" icon="activity" color="var(--ka-3b82f6)" sub="model score" />
      <app-kpi label="Est. Monthly Saving" value="$42.6K" icon="trending-up" color="var(--ka-f97316)" sub="if all accepted" />
    </section>

    <section class="dash">
      <div class="card span-7">
        <div class="card-head">
          <h3>Insights</h3>
          <div class="tabs">
            @for (t of kindTabs; track t) {
              <button [class.on]="kind() === t" (click)="kind.set(t)">{{ t }}</button>
            }
          </div>
        </div>
        <div class="insights">
          @for (i of shown(); track i.id) {
            <article class="insight" [class.done]="i.status !== 'New'">
              <span class="ins-icon" [style.background]="style[i.kind].color"><app-icon [name]="style[i.kind].icon" [size]="18" /></span>
              <div class="ins-body">
                <div class="ins-top">
                  <span class="tag" [style.background]="'color-mix(in srgb, ' + style[i.kind].color + ' 12%, transparent)'" [style.color]="style[i.kind].color">{{ i.kind }}</span>
                  <span class="muted">Confidence {{ i.confidence }}% · Impact {{ i.impact }}</span>
                </div>
                <b>{{ i.title }}</b>
                <p>{{ i.detail }}</p>
                <div class="rec"><app-icon name="lightbulb" [size]="14" />{{ i.action }}</div>
                <div class="toolbar">
                  @if (i.status === 'New') {
                    <button class="btn-primary btn-sm" (click)="setStatus(i, 'Accepted')">Accept &amp; create task</button>
                    <button class="btn-ghost sm" (click)="setStatus(i, 'Dismissed')">Dismiss</button>
                  } @else {
                    <span class="tag" [class.green]="i.status === 'Accepted'" [class.grey]="i.status === 'Dismissed'">{{ i.status }}</span>
                    <button class="link" (click)="setStatus(i, 'New')">Undo</button>
                  }
                </div>
              </div>
            </article>
          } @empty {
            <p class="empty-note">No insights in this category</p>
          }
        </div>
      </div>

      <div class="span-5 col">
        <div class="card copilot">
          <div class="card-head"><h3><app-icon name="bot" [size]="18" /> Ask People360 Copilot</h3></div>
          <div class="chat">
            @for (m of chat(); track $index) {
              <div class="msg" [class.me]="m.me">{{ m.text }}</div>
            }
          </div>
          <div class="suggest">
            @for (s of suggestions; track s) {
              <button class="btn-ghost sm" (click)="ask(s)">{{ s }}</button>
            }
          </div>
          <form class="ask" (submit)="$event.preventDefault(); ask(input.value); input.value = ''">
            <input #input class="input" placeholder="Ask about attendance, visitors, alerts..." />
            <button class="btn-primary" type="submit">Ask</button>
          </form>
        </div>
        <div class="card">
          <div class="card-head"><h3>Occupancy Forecast <span class="card-sub">Head Office</span></h3></div>
          <app-line-chart [labels]="forecast().labels" [series]="forecast().series" [height]="200" suffix="%" [min]="40" [max]="100" />
        </div>
      </div>
    </section>
  `,
  styles: `
    .col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .insights { display: flex; flex-direction: column; gap: 10px; max-height: 760px; overflow: auto; }
    .insight { display: flex; gap: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; transition: opacity 0.2s; }
    .insight.done { opacity: 0.6; }
    .ins-icon { width: 36px; height: 36px; flex-shrink: 0; border-radius: 9px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .ins-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: 13px; }
    .ins-top { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .ins-body p { margin: 0; color: var(--kf-4b4f6b); font-size: 12.5px; }
    .rec { display: flex; gap: 6px; align-items: flex-start; padding: 8px 10px; border-radius: 8px; background: var(--kb-f5f3ff); color: var(--kf-5b21b6); font-size: 12.5px; }
    .copilot h3 { display: flex; align-items: center; gap: 8px; }
    .chat { display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow: auto; margin-bottom: 10px; }
    .msg { max-width: 88%; padding: 8px 12px; border-radius: 12px; background: var(--kb-f3f3f8); font-size: 12.5px; align-self: flex-start; }
    .msg.me { align-self: flex-end; background: var(--primary); color: var(--kf-ffffff); }
    .suggest { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .ask { display: flex; gap: 8px; } .ask .input { flex: 1; min-width: 0; }
  `,
})
export class AiInsights {
  private readonly state = inject(AppState);
  protected readonly style = KIND_STYLE;
  protected readonly kindTabs = ['All', 'Anomaly', 'Prediction', 'Risk', 'Opportunity'];
  protected readonly kind = signal('All');
  protected readonly insights = signal<Insight[]>(INSIGHTS);
  protected readonly suggestions = ['Who is late today?', 'Busiest site?', 'Open security alerts', 'Contractor permits'];
  protected readonly chat = signal([{ me: false, text: 'Hi! I can answer questions about people, attendance, visitors, occupancy and alerts.' }]);

  protected readonly shown = computed(() => this.insights().filter((i) => this.kind() === 'All' || i.kind === this.kind()));
  protected readonly forecast = computed(() => {
    const labels = dayLabels(7, this.state.date()).concat(['+1', '+2', '+3', '+4', '+5'].map((d) => `${d}d`));
    const actual = series(7, 74, 8, 5);
    const fc = [...Array(6).fill(NaN), actual[6], 81, 92, 77, 70, 58];
    return {
      labels,
      series: [
        { name: 'Actual', color: 'var(--ka-7c3aed)', values: [...actual, ...Array(5).fill(NaN)], area: true },
        { name: 'Forecast', color: 'var(--ka-f97316)', values: fc, dashed: true },
      ],
    };
  });

  protected count(s: Insight['status']) {
    return this.insights().filter((i) => i.status === s).length;
  }
  protected setStatus(i: Insight, status: Insight['status']) {
    this.insights.update((list) => list.map((x) => (x.id === i.id ? { ...x, status } : x)));
  }
  protected ask(q: string) {
    if (!q.trim()) return;
    const hit = ANSWERS.find(([re]) => re.test(q));
    this.chat.update((c) => [
      ...c,
      { me: true, text: q },
      { me: false, text: hit ? hit[1] : 'I don’t have data on that in this demo. Try asking about attendance, visitors, occupancy, alerts or contractors.' },
    ]);
  }
}
