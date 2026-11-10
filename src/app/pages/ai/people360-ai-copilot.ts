import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UI } from '../../shared/ui';
import { SelectValue } from '../../shared/select-value';
import { AiStore, ATTENDANCE, ChatAction, EXPIRING, LOCATIONS, Msg, TOTAL_EMPLOYEES, pct } from './ai.data';
import { BotAvatar, ChatMsg, Copilot, exportMsg, msgText } from './copilot-chat';
import { SUGGESTIONS } from './copilot.engine';

const CAPS = [
  { key: 'insights', title: 'Get Insights', text: 'Ask questions in natural language', icon: 'sliders', color: 'var(--ka-2f80ed)', prompts: ['Which department has the highest overtime?', 'Show absenteeism trend', 'Any anomalies today?', 'Who is at risk of leaving?', 'Headcount by department'] },
  { key: 'reports', title: 'Generate Reports', text: 'Create reports and dashboards', icon: 'file-chart', color: 'var(--ka-8b5cf6)', prompts: ['Generate a safety incident report', "Show today's attendance summary by department", 'Show asset utilization by site', 'Show overtime trend for the last 12 weeks', 'Show headcount trend by month'] },
  { key: 'find', title: 'Find People / Assets', text: 'Search across people, assets & locations', icon: 'ai-user-search', color: 'var(--ka-22c55e)', prompts: ['Find Ahmed Hassan', 'Find available meeting rooms', 'Who is in the office right now?', 'Find Priya Sharma', 'Show asset utilization by site'] },
  { key: 'action', title: 'Take Action', text: 'Create tasks, approvals and workflows', icon: 'ai-pointer', color: 'var(--ka-f59e0b)', prompts: ['Create a task to review Gate 3 access logs', 'Send certification renewal reminders', 'Book a meeting room for 6 people', 'What should I act on today?'] },
  { key: 'alerts', title: 'Set Alerts', text: 'Proactive monitoring and notifications', icon: 'triangle-alert', color: 'var(--ka-ef4444)', prompts: ['Set alert when attendance drops below 85%', 'Notify me when overtime exceeds 12 h per person', 'Set alert for access denials at any gate', 'Any anomalies today?'] },
];
const QUICK = [
  { title: 'Attendance Anomaly', text: '5% higher absenteeism in Sales this week compared to last week.', icon: 'ai-clock-alert', color: 'var(--ka-22c55e)', bg: 'var(--kb-dcfce7)', prompt: 'Show absenteeism trend' },
  { title: 'Safety Alert', text: '2 near-miss incidents reported today at Warehouse.', icon: 'triangle-alert', color: 'var(--ka-ffffff)', bg: 'var(--kb-f59e0b)', prompt: 'Generate a safety incident report' },
  { title: 'Certification', text: '8 employees with expiring certifications in next 30 days.', icon: 'id-card', color: 'var(--ka-ffffff)', bg: 'var(--kb-8b5cf6)', prompt: 'List employees with expiring certifications in next 30 days.' },
  { title: 'Space Utilization', text: 'Meeting room usage at 78% during peak hours.', icon: 'ai-user-search', color: 'var(--ka-ffffff)', bg: 'var(--kb-3b82f6)', prompt: 'Find available meeting rooms' },
  { title: 'Workforce Trend', text: 'Contractor headcount increased by 12% this month.', icon: 'ai-chart-up', color: 'var(--ka-ffffff)', bg: 'var(--kb-ef4444)', prompt: 'How many contractors this month?' },
];
const PERIODS: Record<string, [number, number, number, number]> = {
  Today: [1094, 70, 54, 30],
  'This Week': [ATTENDANCE.present, ATTENDANCE.late, ATTENDANCE.absent, ATTENDANCE.leave],
  'This Month': [1071, 81, 63, 33],
};

@Component({
  selector: 'app-ai-people360-ai-copilot',
  imports: [...UI, SelectValue, RouterLink, ChatMsg, BotAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head crumbs-top">
      <div>
        <nav class="crumbs top"><a routerLink="/ai-people-intelligence">AI &amp; People Intelligence</a><app-icon name="chevron-right" [size]="14" /><span>People360 AI Copilot</span></nav>
        <h1>People360 AI Copilot</h1>
        <p class="subtitle"><app-icon name="sparkles" [size]="14" class="spk" />Your intelligent assistant for people, workplace and operations. Ask questions, get instant insights, create reports and take action.</p>
      </div>
      <div class="head-btns">
        <button class="btn-primary" (click)="newConv()"><app-icon name="sparkles" [size]="16" />New Conversation</button>
        <div class="menu-wrap">
          <button class="btn-ghost" (click)="toggleMenu('saved')"><app-icon name="ai-bookmark" [size]="16" />Saved Prompts</button>
          @if (menu() === 'saved') {
            <div class="dropdown sp">
              @for (p of store.savedPrompts(); track p) {
                <div class="sp-row"><button class="dd-item" (click)="send(p)">{{ p }}</button><button class="x" title="Remove" (click)="removePrompt(p)">×</button></div>
              } @empty {<p class="muted sp-empty">No saved prompts yet.</p>}
              <button class="dd-item add" [disabled]="!draft().trim()" (click)="savePrompt()"><app-icon name="plus" [size]="14" />Save current question</button>
            </div>
          }
        </div>
        <div class="menu-wrap">
          <button class="btn-ghost more" (click)="toggleMenu('more')" aria-label="More">⋮</button>
          @if (menu() === 'more') {
            <div class="dropdown">
              <button class="dd-item" (click)="menu.set(null); history.set(true)"><app-icon name="ai-history" [size]="15" />Conversation history</button>
              <button class="dd-item" (click)="exportConv()"><app-icon name="download" [size]="15" />Export conversation</button>
              <button class="dd-item" (click)="menu.set(null); chatOpen.set(true); expanded.set(true)"><app-icon name="maximize" [size]="15" />Open full-screen chat</button>
              <button class="dd-item danger" (click)="clearConv()"><app-icon name="ai-trash" [size]="15" />Clear conversation</button>
            </div>
          }
        </div>
      </div>
    </div>

    <section class="caps">
      @for (c of caps; track c.key) {
        <button class="card cap" [class.on]="cap() === c.key" (click)="pickCap(c.key)">
          <span class="cap-ic" [style.background]="c.color"><app-icon [name]="c.icon" [size]="22" /></span>
          <span class="cap-t"><b>{{ c.title }}</b><small>{{ c.text }}</small></span>
        </button>
      }
    </section>

    <section class="main" [class.solo]="!chatOpen()">
      <div class="left">
        <div class="hero">
          <div class="robot" aria-hidden="true">
            <svg viewBox="0 0 150 170" width="140" height="160">
              <defs>
                <radialGradient id="rbHead" cx="40%" cy="30%"><stop offset="0" stop-color="var(--ka-ffffff)" /><stop offset="1" stop-color="var(--ka-e7e2fb)" /></radialGradient>
                <linearGradient id="rbVisor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--ka-3b1a8a)" /><stop offset="1" stop-color="var(--ka-1e0b4f)" /></linearGradient>
              </defs>
              <ellipse cx="75" cy="162" rx="44" ry="6" fill="var(--ka-d9d0fb)" />
              <line x1="75" y1="12" x2="75" y2="28" stroke="var(--kl-b9acef)" stroke-width="4" /><circle cx="75" cy="10" r="7" fill="var(--ka-a78bfa)" />
              <rect x="22" y="26" width="106" height="78" rx="36" fill="url(#rbHead)" stroke="var(--kl-d6cdf7)" stroke-width="2" />
              <rect x="12" y="52" width="14" height="28" rx="7" fill="var(--ka-c9bcf6)" /><rect x="124" y="52" width="14" height="28" rx="7" fill="var(--ka-c9bcf6)" />
              <rect x="34" y="40" width="82" height="52" rx="24" fill="url(#rbVisor)" />
              <ellipse cx="58" cy="62" rx="8" ry="10" fill="var(--ka-a78bfa)" /><ellipse cx="92" cy="62" rx="8" ry="10" fill="var(--ka-a78bfa)" />
              <ellipse cx="58" cy="62" rx="4" ry="5" fill="var(--ka-ede9fe)" /><ellipse cx="92" cy="62" rx="4" ry="5" fill="var(--ka-ede9fe)" />
              <path d="M64 78q11 8 22 0" fill="none" stroke="var(--kl-a78bfa)" stroke-width="3.5" stroke-linecap="round" />
              <path d="M40 104h70l6 44a8 8 0 0 1-8 9H42a8 8 0 0 1-8-9z" fill="url(#rbHead)" stroke="var(--kl-d6cdf7)" stroke-width="2" />
              <rect x="20" y="108" width="16" height="40" rx="8" fill="var(--ka-e6e0fb)" stroke="var(--kl-d6cdf7)" transform="rotate(12 28 108)" />
              <rect x="114" y="108" width="16" height="40" rx="8" fill="var(--ka-e6e0fb)" stroke="var(--kl-d6cdf7)" transform="rotate(-12 122 108)" />
              <circle cx="75" cy="130" r="15" fill="var(--ka-ede9fe)" stroke="var(--kl-8b5cf6)" stroke-width="3" />
              <text x="75" y="136" text-anchor="middle" font-size="17" font-weight="700" fill="var(--ka-7c3aed)">P</text>
            </svg>
          </div>
          <div class="hero-body">
            <h2 class="hi">Hi Ram 👋</h2>
            <h2 class="how">How can I help you today?</h2>
            <p class="ask">Ask anything about your people, workplace, safety, assets or operations.</p>
            <div class="chips">
              @for (p of chips(); track p; let i = $index) {
                <button class="chip-btn" (click)="send(p)">{{ p }}</button>
                @if (i === 2) {<button class="chip-btn refresh" title="More suggestions" (click)="rotate()"><app-icon name="refresh" [size]="15" /></button>}
              }
            </div>
          </div>
          <div class="composer" [class.listening]="listening()">
            <input #box [placeholder]="listening() ? 'Listening… speak now' : 'Ask a question or type a command...'" [value]="draft()" (input)="draft.set($any($event.target).value)" (keydown.enter)="sendDraft()" />
            <label class="ic" title="Attach a file"><app-icon name="ai-paperclip" [size]="18" /><input type="file" accept=".csv,.txt,.xlsx" hidden (change)="attach($event)" /></label>
            <button class="ic" [class.rec]="listening()" title="Voice input" (click)="voice()"><app-icon name="ai-mic" [size]="18" /></button>
            <button class="send" title="Send" [disabled]="copilot.busy()" (click)="sendDraft()"><app-icon name="ai-send" [size]="20" /></button>
          </div>
        </div>

        <div class="card qi">
          <div class="card-head"><h3>Quick Insights for You</h3><a class="link" routerLink="/ai-people-intelligence/workforce-insights">View All Insights</a></div>
          <div class="qi-row">
            @for (q of quick; track q.title) {
              <div class="qi-card">
                <div class="qi-h"><span class="qi-ic" [style.background]="q.bg" [style.color]="q.color"><app-icon [name]="q.icon" [size]="15" /></span><b>{{ q.title }}</b></div>
                <p>{{ q.text }}</p>
                <button class="vd" (click)="send(q.prompt)">View Details <span>→</span></button>
              </div>
            }
          </div>
        </div>

        <div class="two">
          <div class="card">
            <div class="card-head"><h3>Attendance Overview</h3>
              <select class="select sm" [value]="period()" (change)="period.set($any($event.target).value)">@for (p of periods; track p) {<option [value]="p">{{ p }}</option>}</select>
            </div>
            <div class="att">
              <div class="ring">
                <svg viewBox="0 0 160 160">
                  @for (s of attSegs(); track s.label) {
                    <circle cx="80" cy="80" r="62" fill="none" [attr.stroke]="s.color" [attr.stroke-width]="hoverSeg() === s.label ? 24 : 19" [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off" transform="rotate(-90 80 80)" (mouseenter)="hoverSeg.set(s.label)" (mouseleave)="hoverSeg.set(null)" (click)="send(segPrompt(s.label))" />
                  }
                </svg>
                <div class="ring-mid"><b>{{ total.toLocaleString() }}</b><span>Total Employees</span></div>
              </div>
              <ul class="att-leg">
                @for (s of attSegs(); track s.label) {
                  <li [class.dim]="hoverSeg() && hoverSeg() !== s.label" (mouseenter)="hoverSeg.set(s.label)" (mouseleave)="hoverSeg.set(null)" (click)="send(segPrompt(s.label))">
                    <i [style.background]="s.color"></i><span>{{ s.label }}</span><b>{{ s.value.toLocaleString() }}</b><em>({{ s.pct }}%)</em>
                  </li>
                }
              </ul>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3>People by Location</h3>
              <select class="select sm" [value]="loc()" (change)="loc.set($any($event.target).value)">@for (l of locations; track l.name) {<option [value]="l.name">{{ l.name }}</option>}</select>
            </div>
            <ul class="locs">
              @for (l of locations; track l.name; let i = $index) {
                <li [class.on]="loc() === l.name" (click)="loc.set(l.name); send('Who is in the office right now at ' + l.name + '?')" [title]="'Ask Copilot about ' + l.name">
                  <span>{{ l.name }}</span>
                  <div><i [style.width.%]="(l.count / 428) * 66" [style.background]="loc() === l.name ? 'var(--ka-1d4ed8)' : barColors[i]"></i></div>
                  <b>{{ l.count }}</b><em>{{ locPct(l.count) }}%</em>
                </li>
              }
            </ul>
          </div>
        </div>

        <div class="two">
          <div class="card">
            <div class="card-head"><h3>Recent AI Insights</h3><a class="link" routerLink="/ai-people-intelligence/anomaly-detection">View All</a></div>
            <ul class="ins">
              @for (a of recent(); track a.id) {
                <li (click)="openAnomaly(a.id)">
                  <i [style.background]="a.dot"></i><span class="t">{{ a.title }}</span><span class="when">{{ a.ago }}</span>
                  <span class="sev" [class]="'sev ' + a.severity">{{ a.severity }}</span>
                </li>
              }
            </ul>
          </div>
          <div class="card">
            <div class="card-head"><h3>AI Recommended Actions</h3><a class="link" routerLink="/ai-people-intelligence/recommendation-engine">View All</a></div>
            <ul class="recs">
              @for (r of recs(); track r.id) {
                <li>
                  <span class="r-ic" [style.background]="r.color"><app-icon [name]="r.icon" [size]="12" /></span>
                  <span class="t" [class.done]="r.status !== 'Open'">{{ r.title }}</span>
                  @if (r.status === 'Open') {<button class="r-btn" (click)="recAct(r.id)">{{ r.action }}</button>}
                  @else {<span class="r-st"><app-icon name="ai-check" [size]="12" [stroke]="2.6" />{{ r.status }}</span>}
                </li>
              }
            </ul>
          </div>
        </div>
      </div>

      @if (chatOpen()) {
        <div class="right">
          @if (expanded()) {<div class="g-overlay" (click)="expanded.set(false)"></div>}
          <aside class="card chat" [class.full]="expanded()">
            <header class="c-head">
              <ai-bot-avatar [size]="42" />
              <div><b>People360 AI Copilot</b><span class="online"><i></i>Online</span></div>
              <span class="conv-t" [title]="store.current().title">{{ expanded() ? store.current().title : '' }}</span>
              <button class="hb" [title]="expanded() ? 'Exit full screen' : 'Expand'" (click)="expanded.set(!expanded())"><app-icon name="maximize" [size]="17" /></button>
              <button class="hb x" title="Close" (click)="closeChat()">×</button>
            </header>
            <div class="c-body" #scroller>
              @for (m of store.current().msgs; track m.id) {
                <ai-msg [msg]="m" [blocks]="copilot.visible(m)" [done]="copilot.done(m)" [doneActs]="doneActs()" (act)="onAct(m, $event)" (rate)="rate(m, $event)" (copy)="copyMsg(m)" (pin)="pinMsg(m)" (prompt)="send($event)" />
              } @empty {
                <div class="empty"><ai-bot-avatar [size]="64" /><b>New conversation</b><p>Ask me anything about your people, workplace, safety, assets or operations.</p>
                  <div class="e-sugs">@for (p of chips().slice(0, 4); track p) {<button (click)="send(p)">{{ p }}</button>}</div></div>
              }
              @if (copilot.typing()) {<div class="typing"><ai-bot-avatar [size]="34" /><span class="dots3"><i></i><i></i><i></i></span><small>Copilot is analysing People360 data…</small></div>}
            </div>
            @if (expanded()) {
              <div class="composer in-chat">
                <input [value]="draft()" placeholder="Ask a follow-up question..." (input)="draft.set($any($event.target).value)" (keydown.enter)="sendDraft()" />
                <button class="send" [disabled]="copilot.busy()" (click)="sendDraft()"><app-icon name="ai-send" [size]="18" /></button>
              </div>
            }
          </aside>
        </div>
      }
    </section>

    @if (!chatOpen()) {
      <button class="fab" (click)="chatOpen.set(true)"><ai-bot-avatar [size]="30" />Open Copilot</button>
    }

    @if (history()) {
      <div class="g-overlay" (click)="history.set(false)"></div>
      <aside class="g-drawer">
        <div class="modal-head"><h3>Conversation history</h3><button class="close-btn" (click)="history.set(false)">×</button></div>
        <ul class="hist">
          @for (c of store.conversations(); track c.id) {
            <li [class.on]="c.id === store.currentId()">
              <button class="h-main" (click)="openConv(c.id)"><b>{{ c.title }}</b><small>{{ c.when }} · {{ c.msgs.length || 'no' }} messages</small></button>
              <button class="x" title="Delete" (click)="store.deleteConversation(c.id)"><app-icon name="ai-trash" [size]="14" /></button>
            </li>
          }
        </ul>
        <button class="btn-primary full" (click)="newConv(); history.set(false)"><app-icon name="sparkles" [size]="15" />New Conversation</button>
      </aside>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    :host { display: block; }
    .subtitle { display: flex; align-items: center; gap: 6px; } .spk { color: var(--kf-7c3aed); }
    .page-head { position: relative; display: block; margin-bottom: 16px; } .page-head h1 { padding-right: 520px; }
    .head-btns { position: absolute; right: 0; top: 22px; display: flex; gap: 10px; align-items: center; }
    .head-btns .btn-primary { padding: 10px 22px; } .head-btns .btn-ghost { padding: 9px 22px; } .head-btns .more { padding: 9px 14px; font-weight: 700; }
    .sp { width: 360px; } .sp-row { display: flex; align-items: center; } .sp-row .dd-item { white-space: normal; flex: 1; }
    .x { border: 0; background: none; color: var(--kf-8a8fa8); cursor: pointer; font-size: 16px; padding: 4px 6px; border-radius: 4px; } .x:hover { color: var(--red); background: var(--kb-fef2f2); }
    .sp .add { border-top: 1px solid var(--border); border-radius: 0; margin-top: 4px; color: var(--primary); } .sp .add:disabled { opacity: 0.45; cursor: default; }
    .sp-empty { padding: 8px 10px; margin: 0; font-size: 12px; }
    .danger { color: var(--red); }

    .caps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
    .cap { display: flex; gap: 14px; align-items: center; text-align: left; cursor: pointer; padding: 14px 16px; transition: box-shadow 0.15s, border-color 0.15s; }
    .cap:hover { box-shadow: 0 6px 18px rgba(80, 60, 160, 0.1); } .cap.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .cap-ic { width: 46px; height: 46px; border-radius: 9px; display: grid; place-items: center; color: var(--kf-ffffff); flex: none; }
    .cap-t { display: flex; flex-direction: column; gap: 3px; min-width: 0; } .cap-t b { font-size: 13px; } .cap-t small { font-size: 12.5px; color: var(--kf-5b5f7a); line-height: 1.35; }

    .main { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(380px, 1fr); gap: 14px; align-items: stretch; }
    .main.solo { grid-template-columns: minmax(0, 1fr); }
    .left { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .right { position: relative; min-height: 600px; }
    .chat { position: absolute; inset: 0; display: flex; flex-direction: column; padding: 0; overflow: hidden; }
    .chat.full { position: fixed; inset: auto; top: 4vh; left: 50%; transform: translateX(-50%); width: min(1120px, 92vw); height: 92vh; z-index: 70; box-shadow: 0 24px 60px rgba(20, 20, 60, 0.3); }

    .hero { position: relative; border-radius: 12px; padding: 22px 12px 16px 150px; background: linear-gradient(115deg, var(--kb-ece6ff) 0%, var(--kb-f6f2ff) 38%, var(--kb-efe8ff) 70%, var(--kb-e6dcff) 100%); border: 1px solid var(--kl-e4dcfb); overflow: hidden; }
    .hero::after { content: ''; position: absolute; right: -60px; top: -80px; width: 260px; height: 260px; border-radius: 50%; background: radial-gradient(circle, rgba(167, 139, 250, 0.25), transparent 70%); pointer-events: none; }
    .robot { position: absolute; left: 18px; top: 16px; }
    .hi { margin: 0; font-size: 21px; font-weight: 700; color: var(--kf-1a1840); }
    .how { margin: 2px 0 6px; font-size: 24px; font-weight: 700; color: var(--kf-1a1840); letter-spacing: -0.3px; }
    .ask { margin: 0 0 14px; font-size: 14px; color: var(--kf-3d4060); }
    .chips { display: flex; flex-wrap: wrap; gap: 7px; position: relative; z-index: 1; }
    .chip-btn { border: 1px solid var(--kl-e3def5); background: var(--kb-ffffff); border-radius: 6px; padding: 6px 8px; font-size: 11px; color: var(--kf-2d3050); cursor: pointer; }
    .chip-btn:hover { border-color: var(--kl-a78bfa); color: var(--kf-6d28d9); }
    .chip-btn.refresh { padding: 5px 9px; display: grid; place-items: center; color: var(--kf-4b4f6b); }
    .composer { position: relative; z-index: 1; display: flex; align-items: center; gap: 6px; margin: 18px 8px 0 -138px; background: var(--kb-ffffff); border: 1px solid var(--kl-e4def6); border-radius: 10px; padding: 6px 6px 6px 16px; }
    .composer.listening { border-color: var(--kl-a78bfa); box-shadow: 0 0 0 3px var(--kb-ede9fe); }
    .composer input { flex: 1; border: 0; outline: 0; font: inherit; font-size: 13px; padding: 10px 0; background: none; min-width: 0; }
    .composer .ic { border: 0; background: none; color: var(--kf-4b4f6b); cursor: pointer; padding: 6px 8px; display: grid; place-items: center; border-radius: 6px; }
    .composer .ic:hover { background: var(--kb-f5f3ff); color: var(--kf-7c3aed); } .composer .ic.rec { color: var(--kf-ef4444); animation: pulse 1s infinite; }
    @keyframes pulse { 50% { opacity: 0.4; } }
    .send { width: 42px; height: 42px; border: 0; border-radius: 9px; background: linear-gradient(135deg, var(--kb-7c3aed), var(--kb-6d28d9)); color: var(--kf-ffffff); display: grid; place-items: center; cursor: pointer; margin-left: 4px; }
    .send:disabled { opacity: 0.55; cursor: progress; }

    .qi { padding: 14px; } .qi .card-head { margin-bottom: 10px; } .qi h3, .two h3 { font-size: 15.5px; margin: 0; }
    .link { font-size: 12.5px; color: var(--kf-2563eb); text-decoration: none; cursor: pointer; }
    .qi-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
    .qi-card { border: 1px solid var(--border); border-radius: 8px; padding: 10px 9px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .qi-h { display: flex; align-items: center; gap: 7px; } .qi-h b { font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.1px; }
    .qi-ic { width: 22px; height: 22px; border-radius: 5px; display: grid; place-items: center; flex: none; }
    .qi-card p { margin: 0; font-size: 12px; line-height: 1.35; color: var(--kf-3d4060); flex: 1; }
    .vd { border: 0; background: none; padding: 0; color: var(--kf-2563eb); font-size: 12px; text-align: left; cursor: pointer; } .vd span { margin-left: 6px; }

    .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .two .card { padding: 14px 14px 12px; } .two .card-head { margin-bottom: 10px; }
    .select.sm { padding: 5px 26px 5px 10px; font-size: 12px; height: auto; min-width: 92px; }
    .att { display: grid; grid-template-columns: 150px 1fr; gap: 18px; align-items: center; }
    .ring { position: relative; width: 150px; height: 150px; } .ring svg { width: 100%; height: 100%; } .ring circle { cursor: pointer; transition: stroke-width 0.15s; }
    .ring-mid { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
    .ring-mid b { font-size: 21px; } .ring-mid span { font-size: 11px; color: var(--kf-3d4060); }
    .att-leg { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .att-leg li { display: grid; grid-template-columns: 14px 1fr auto 52px; gap: 8px; align-items: center; font-size: 12.5px; cursor: pointer; }
    .att-leg li.dim { opacity: 0.4; } .att-leg i { width: 11px; height: 11px; border-radius: 50%; } .att-leg b { text-align: right; } .att-leg em { font-style: normal; color: var(--kf-4b4f6b); }
    .locs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
    .locs li { display: grid; grid-template-columns: 76px 1fr 44px 40px; gap: 8px; align-items: center; font-size: 11.5px; cursor: pointer; padding: 1px 0; border-radius: 4px; }
    .locs li:hover { background: var(--kb-f8f7fd); } .locs li span { color: var(--kf-2d3050); }
    .locs div { height: 12px; } .locs i { display: block; height: 100%; border-radius: 1px; transition: background 0.2s; }
    .locs b { text-align: right; font-size: 12px; } .locs em { font-style: normal; text-align: right; color: var(--kf-3d4060); }
    .locs li.on span { font-weight: 600; color: var(--kf-1d4ed8); }

    .ins, .recs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .ins li { display: grid; grid-template-columns: 9px 1fr auto 50px; gap: 7px; align-items: center; padding: 5px 0; font-size: 11px; cursor: pointer; border-radius: 4px; }
    .ins li:hover .t { color: var(--primary); }
    .ins i { width: 9px; height: 9px; border-radius: 50%; } .ins .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--kf-2d3050); } .ins .when { color: var(--kf-6b7090); font-size: 11px; }
    .sev { text-align: center; border-radius: 4px; padding: 2px 0; font-size: 11px; } .sev.Medium { background: var(--kb-fdefd3); color: var(--kf-b45309); } .sev.High { background: var(--kb-fde2e2); color: var(--kf-dc2626); } .sev.Info { background: var(--kb-dbeafe); color: var(--kf-1d4ed8); } .sev.Low { background: var(--kb-dcfce7); color: var(--kf-15803d); }
    .recs li { display: grid; grid-template-columns: 18px 1fr 94px; gap: 8px; align-items: center; padding: 3px 0; font-size: 11px; }
    .r-ic { width: 17px; height: 17px; border-radius: 4px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .recs .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--kf-2d3050); } .recs .t.done { color: var(--kf-8a8fa8); text-decoration: line-through; }
    .r-btn { border: 1px solid var(--kl-e3e1ee); background: var(--kb-ffffff); color: var(--kf-5b21b6); border-radius: 4px; padding: 4px 0; font-size: 11px; cursor: pointer; white-space: nowrap; } .r-btn:hover { border-color: var(--kl-a78bfa); }
    .r-st { display: inline-flex; align-items: center; justify-content: center; gap: 3px; font-size: 11px; color: var(--kf-15803d); }

    .c-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--kl-f0eef8); }
    .c-head > div { display: flex; flex-direction: column; } .c-head b { font-size: 15px; }
    .online { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--kf-3d4060); } .online i { width: 9px; height: 9px; border-radius: 50%; background: var(--kb-22c55e); }
    .conv-t { flex: 1; text-align: right; font-size: 12px; color: var(--kf-6b7090); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .hb { border: 0; background: none; color: var(--kf-2d3050); cursor: pointer; padding: 6px; border-radius: 6px; display: grid; place-items: center; } .hb:hover { background: var(--kb-f5f3ff); }
    .hb.x { font-size: 26px; line-height: 0.7; font-weight: 300; }
    .c-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 12px 16px; display: flex; flex-direction: column; gap: 14px; scroll-behavior: smooth; }
    .chat.full .c-body { padding: 18px 10%; }
    .typing { display: flex; align-items: center; gap: 10px; } .typing small { color: var(--kf-8a8fa8); font-size: 11px; }
    .dots3 { display: inline-flex; gap: 4px; background: var(--kb-f3f0fd); padding: 10px 12px; border-radius: 4px 12px 12px 12px; }
    .dots3 i { width: 7px; height: 7px; border-radius: 50%; background: var(--kb-8b5cf6); animation: bounce 1s infinite; } .dots3 i:nth-child(2) { animation-delay: 0.15s; } .dots3 i:nth-child(3) { animation-delay: 0.3s; }
    @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.5; } 30% { transform: translateY(-4px); opacity: 1; } }
    .empty { margin: auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: 320px; }
    .empty p { margin: 0; font-size: 12.5px; color: var(--kf-6b7090); }
    .e-sugs { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 8px; }
    .e-sugs button { border: 1px solid var(--kl-ddd6fe); background: var(--kb-ffffff); color: var(--kf-6d28d9); border-radius: 14px; padding: 5px 10px; font-size: 11.5px; cursor: pointer; }
    .composer.in-chat { margin: 0; border-radius: 0; border: 0; border-top: 1px solid var(--kl-f0eef8); padding: 10px 12px 10px 18px; }

    .fab { position: fixed; right: 26px; bottom: 26px; z-index: 50; display: flex; align-items: center; gap: 8px; border: 0; border-radius: 26px; padding: 7px 18px 7px 8px; background: var(--kb-7c3aed); color: var(--kf-ffffff); font-size: 13.5px; font-weight: 600; cursor: pointer; box-shadow: 0 10px 28px rgba(124, 58, 237, 0.4); }
    .hist { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .hist li { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 8px; } .hist li.on { border-color: var(--primary); background: var(--kb-faf8ff); }
    .h-main { flex: 1; border: 0; background: none; text-align: left; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .h-main b { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .h-main small { font-size: 11px; color: var(--muted); }
    .full { width: 100%; justify-content: center; }

    @media (max-width: 1400px) { .qi-row { grid-template-columns: repeat(3, minmax(0, 1fr)); } .caps { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 1180px) { .main { grid-template-columns: 1fr; } .right { min-height: 640px; } .two { grid-template-columns: 1fr; } }
  `,
})
export class People360AICopilot {
  protected readonly store = inject(AiStore);
  protected readonly copilot = inject(Copilot);
  private readonly router = inject(Router);
  protected readonly caps = CAPS;
  protected readonly quick = QUICK;
  protected readonly locations = LOCATIONS;
  protected readonly periods = Object.keys(PERIODS);
  protected readonly total = TOTAL_EMPLOYEES;
  protected readonly barColors = ['var(--ka-2563eb)', 'var(--ka-3b82f6)', 'var(--ka-3b82f6)', 'var(--ka-6aa5f8)', 'var(--ka-93c5fd)'];

  protected readonly draft = signal('');
  protected readonly menu = signal<'saved' | 'more' | null>(null);
  protected readonly cap = signal<string | null>(null);
  protected readonly sugSet = signal(0);
  protected readonly period = signal('This Week');
  protected readonly loc = signal('Head Office');
  protected readonly hoverSeg = signal<string | null>(null);
  protected readonly chatOpen = signal(true);
  protected readonly expanded = signal(false);
  protected readonly history = signal(false);
  protected readonly listening = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly doneActs = signal<Set<string>>(new Set());
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly chips = computed(() => {
    const c = CAPS.find((x) => x.key === this.cap());
    return c ? c.prompts : SUGGESTIONS[this.sugSet() % SUGGESTIONS.length];
  });
  protected readonly attSegs = computed(() => {
    const [p, l, a, lv] = PERIODS[this.period()];
    const C = 2 * Math.PI * 62;
    let off = 0;
    return [
      { label: 'Present', value: p, color: 'var(--ka-22c55e)' },
      { label: 'Late', value: l, color: 'var(--ka-f59e0b)' },
      { label: 'Absent', value: a, color: 'var(--ka-ef4444)' },
      { label: 'On Leave', value: lv, color: 'var(--ka-64748b)' },
    ].map((s) => {
      const len = (s.value / TOTAL_EMPLOYEES) * C;
      const out = { ...s, pct: pct(s.value, TOTAL_EMPLOYEES), dash: `${Math.max(len - 1, 0)} ${C}`, off: -off };
      off += len;
      return out;
    });
  });
  protected readonly recent = computed(() => this.store.anomalies().filter((a) => ['AN-301', 'AN-302', 'AN-303', 'AN-304'].includes(a.id)));
  protected readonly recs = computed(() => this.store.recs().filter((r) => ['RC-01', 'RC-02', 'RC-03', 'RC-04'].includes(r.id)));

  constructor() {
    // Prompt queued from another page ("Ask Copilot").
    const pending = this.store.pending();
    if (pending) {
      this.store.pending.set(null);
      this.store.newConversation();
      setTimeout(() => this.send(pending), 300);
    }
    // Keep the newest message in view while answers stream in.
    let first = true;
    effect(() => {
      this.store.current().msgs.length;
      this.copilot.stream();
      this.copilot.typing();
      const el = this.scroller()?.nativeElement;
      if (!el) return;
      if (first) {
        first = false;
        return;
      }
      untracked(() => requestAnimationFrame(() => (el.scrollTop = el.scrollHeight)));
    });
  }

  protected fmtLoc = (n: number) => n;
  protected locPct(n: number) {
    return Math.round((n / TOTAL_EMPLOYEES) * 100);
  }
  protected segPrompt(label: string) {
    return label === 'Late' ? 'Show late arrivals' : label === 'Absent' ? 'Show absenteeism trend' : label === 'On Leave' ? 'Who is on leave today?' : 'Show attendance summary for all sites';
  }
  protected toggleMenu(m: 'saved' | 'more') {
    this.menu.set(this.menu() === m ? null : m);
  }
  protected send(text: string) {
    this.menu.set(null);
    this.chatOpen.set(true);
    if (this.copilot.busy()) return this.flash('Copilot is still answering — one moment…');
    this.copilot.ask(text);
  }
  protected sendDraft() {
    const t = this.draft().trim();
    if (!t) return this.box()?.nativeElement.focus();
    if (this.copilot.busy()) return this.flash('Copilot is still answering — one moment…');
    this.draft.set('');
    const el = this.box()?.nativeElement;
    if (el) el.value = '';
    this.send(t);
  }
  protected rotate() {
    this.cap.set(null);
    this.sugSet.update((n) => n + 1);
  }
  protected pickCap(key: string) {
    this.cap.set(this.cap() === key ? null : key);
    this.box()?.nativeElement.focus();
  }
  protected newConv() {
    this.store.newConversation();
    this.chatOpen.set(true);
    this.draft.set('');
    this.flash('Started a new conversation');
  }
  protected openConv(id: number) {
    this.store.currentId.set(id);
    this.history.set(false);
    this.chatOpen.set(true);
    const c = this.store.current();
    if (!c.msgs.length && c.title !== 'New conversation') this.send(c.title);
  }
  protected clearConv() {
    this.menu.set(null);
    const id = this.store.currentId();
    this.store.conversations.update((l) => l.map((c) => (c.id === id ? { ...c, msgs: [], title: 'New conversation' } : c)));
    this.flash('Conversation cleared');
  }
  protected exportConv() {
    this.menu.set(null);
    const c = this.store.current();
    const txt = c.msgs.map((m) => `[${m.time}] ${m.role === 'user' ? 'Rex' : 'Copilot'}:\n${msgText(m)}`).join('\n\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`People360 AI Copilot — ${c.title}\n\n${txt}`], { type: 'text/plain' }));
    a.download = 'copilot-conversation.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  protected savePrompt() {
    const t = this.draft().trim();
    if (!t) return;
    this.store.savedPrompts.update((l) => (l.includes(t) ? l : [...l, t]));
    this.flash('Prompt saved');
  }
  protected removePrompt(p: string) {
    this.store.savedPrompts.update((l) => l.filter((x) => x !== p));
  }
  protected closeChat() {
    this.expanded.set(false);
    this.chatOpen.set(false);
  }
  protected openAnomaly(id: string) {
    this.router.navigateByUrl(`/ai-people-intelligence/anomaly-detection?id=${id}`);
  }
  protected recAct(id: string) {
    const r = this.store.recs().find((x) => x.id === id)!;
    if (id === 'RC-01') {
      this.store.addTask(r.title);
      this.store.patchRec(id, { status: 'In Progress' });
      return this.flash('Training task created for 8 employees · assigned to Safety team');
    }
    if (id === 'RC-02') {
      this.store.remind(EXPIRING.map((e) => e.name));
      return this.flash(`Renewal reminders sent to ${EXPIRING.length} employees and their managers`);
    }
    if (id === 'RC-03') return this.router.navigateByUrl('/ai-people-intelligence/recommendation-engine?id=RC-03');
    this.router.navigateByUrl('/ai-people-intelligence/natural-language-reports?q=' + encodeURIComponent('late arrivals in Sales by employee this month'));
  }

  // ---------- chat message actions ----------
  private markDone(m: Msg, a: ChatAction) {
    this.doneActs.update((s) => new Set([...s, m.id + ':' + a.label]));
  }
  protected onAct(m: Msg, a: ChatAction) {
    switch (a.kind) {
      case 'nav':
        this.expanded.set(false);
        return this.router.navigateByUrl(a.arg!);
      case 'prompt':
        return this.send(a.arg!);
      case 'expand':
        return this.store.patchMsg(m.id, { expanded: !m.expanded });
      case 'csv':
        exportMsg(m, `copilot-${a.arg ?? 'answer'}.csv`);
        return this.flash('CSV downloaded');
      case 'remind':
        this.store.remind(EXPIRING.map((e) => e.name));
        this.markDone(m, a);
        return this.flash(`Renewal reminders sent to ${EXPIRING.length} employees (email + push)`);
      case 'task':
        this.store.addTask(a.arg ?? a.label);
        if (/training|certif/i.test(a.arg ?? '')) this.store.patchRec('RC-01', { status: 'In Progress' });
        this.markDone(m, a);
        return this.flash('Task created and assigned · visible in Tasks & Workforce Operations');
      case 'book':
        this.markDone(m, a);
        return this.flash(`${a.arg} booked for you, next 30 minutes · invite sent`);
      case 'alert':
        this.store.alerts.update((l) => [...l, { id: this.store.id(), rule: a.arg!, when: 'Active · just now' }]);
        this.markDone(m, a);
        return this.flash('Alert rule created');
      default:
        return this.flash(a.label);
    }
  }
  protected rate(m: Msg, r: 'up' | 'down') {
    this.store.patchMsg(m.id, { rating: m.rating === r ? undefined : r });
    this.flash(r === 'up' ? 'Thanks! Feedback recorded.' : "Thanks — I'll use this to improve future answers.");
  }
  protected copyMsg(m: Msg) {
    navigator.clipboard?.writeText(msgText(m)).catch(() => {});
    this.flash('Answer copied to clipboard');
  }
  protected pinMsg(m: Msg) {
    const idx = this.store.current().msgs.findIndex((x) => x.id === m.id);
    const q = this.store.current().msgs[idx - 1]?.text ?? 'Copilot answer';
    this.store.reports.update((l) => [{ id: this.store.id(), title: q.replace(/[.?]$/, '').slice(0, 60), query: q, created: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }, ...l]);
    this.flash('Saved to Natural Language Reports');
  }

  // ---------- composer extras ----------
  protected attach(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const lines = String(r.result).split(/\r?\n/).filter((l) => l.trim());
      const cols = (lines[0] ?? '').split(',').map((c) => c.trim()).filter(Boolean);
      this.copilot.ask(`📎 Analyse ${file.name}`, {
        blocks: [
          { t: 'text', text: `I read ${file.name} (${(file.size / 1024).toFixed(1)} KB). It has ${Math.max(lines.length - 1, 0)} data rows and ${cols.length} columns.` },
          ...(cols.length ? [{ t: 'list' as const, items: cols.slice(0, 8).map((c) => `Column "${c}"`) }] : []),
          { t: 'text', text: 'I can match these rows to People360 employees, compare them with attendance, or build a report from them.' },
        ],
        suggestions: ['Compare with attendance', 'Build a report from this file'],
      });
      input.value = '';
    };
    r.readAsText(file);
  }
  protected voice() {
    if (this.listening()) return;
    this.listening.set(true);
    this.draft.set('');
    const phrase = this.chips()[Math.floor(Math.random() * this.chips().length)];
    setTimeout(() => {
      let i = 0;
      const t = setInterval(() => {
        i += 2;
        this.draft.set(phrase.slice(0, i));
        if (i >= phrase.length) {
          clearInterval(t);
          this.listening.set(false);
        }
      }, 30);
    }, 1300);
  }
  private flash(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}
