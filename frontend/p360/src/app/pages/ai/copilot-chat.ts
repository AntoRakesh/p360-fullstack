// Copilot chat runtime (typing indicator + streamed text) and the message renderer shared by AI pages.
import { ChangeDetectionStrategy, Component, computed, inject, Injectable, input, output, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { AiStore, Answer, Block, Cell, ChatAction, Msg, nowTime } from './ai.data';
import { respond } from './copilot.engine';

const cost = (b: Block) => (b.t === 'text' ? b.text.length : b.t === 'list' ? b.items.join('').length : 70);

@Injectable({ providedIn: 'root' })
export class Copilot {
  private readonly store = inject(AiStore);
  readonly typing = signal(false);
  readonly stream = signal<{ id: number; n: number } | null>(null);
  readonly busy = computed(() => this.typing() || !!this.stream());
  private timer?: ReturnType<typeof setInterval>;

  /** Sends a user message and plays back the canned answer. Returns false when busy/empty. */
  ask(text: string, answer?: Answer | (() => Answer)) {
    text = text.trim();
    if (!text || this.busy()) return false;
    this.store.pushMsg({ id: this.store.id(), role: 'user', time: nowTime(), text });
    this.typing.set(true);
    setTimeout(() => {
      const a = typeof answer === 'function' ? answer() : (answer ?? respond(text, this.store));
      const id = this.store.id();
      this.typing.set(false);
      this.store.pushMsg({ id, role: 'bot', time: nowTime(), ...a });
      const total = (a.blocks ?? []).reduce((s, b) => s + cost(b), 0);
      this.stream.set({ id, n: 0 });
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        const s = this.stream();
        const n = (s?.n ?? total) + 7;
        if (!s || n >= total) {
          this.stream.set(null);
          clearInterval(this.timer);
        } else this.stream.set({ id, n });
      }, 22);
    }, 650 + Math.round(Math.random() * 450));
    return true;
  }

  /** Blocks of a message revealed so far (text is cut mid-way while streaming). */
  visible(m: Msg): Block[] {
    const s = this.stream();
    const blocks = m.blocks ?? [];
    if (!s || s.id !== m.id) return blocks;
    let n = s.n;
    const out: Block[] = [];
    for (const b of blocks) {
      if (n <= 0) break;
      if (b.t === 'text') out.push({ ...b, text: b.text.slice(0, n) });
      else out.push(b);
      n -= cost(b);
    }
    return out;
  }
  done(m: Msg) {
    return this.stream()?.id !== m.id;
  }
}

/** Plain-text version of a message (copy / export). */
export function msgText(m: Msg) {
  if (m.role === 'user') return m.text ?? '';
  return (m.blocks ?? [])
    .map((b) => (b.t === 'text' ? b.text : b.t === 'list' ? b.items.map((i) => '• ' + i).join('\n') : b.t === 'table' ? [b.cols.join(' | '), ...b.rows.map((r) => r.map(cellText).join(' | '))].join('\n') : ''))
    .filter(Boolean)
    .join('\n\n');
}
export const cellText = (c: Cell) => (typeof c === 'object' ? c.text : String(c));
export function exportMsg(m: Msg, name = 'copilot-answer.csv') {
  const t = m.blocks?.find((b) => b.t === 'table');
  if (t && t.t === 'table') return downloadCsv(name, [t.cols, ...t.rows.map((r) => r.map(cellText))]);
  const bars = m.blocks?.find((b) => b.t === 'bars');
  if (bars && bars.t === 'bars') return downloadCsv(name, [['Label', 'Value'], ...bars.rows.map((r) => [r.label, r.value])]);
  const col = m.blocks?.find((b) => b.t === 'column' || b.t === 'line');
  if (col && (col.t === 'column' || col.t === 'line')) return downloadCsv(name, [['Label', ...col.series.map((s) => s.name)], ...col.labels.map((l, i) => [l, ...col.series.map((s) => s.values[i])])]);
  downloadCsv(name, [['Answer'], [msgText(m)]]);
}

/* ---------------- Bot avatar (little robot head) ---------------- */
@Component({
  selector: 'ai-bot-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.width.px]': 'size()', '[style.height.px]': 'size()', style: 'display:inline-block;flex:none' },
  template: `
    <svg viewBox="0 0 40 40" [attr.width]="size()" [attr.height]="size()">
      <circle cx="20" cy="20" r="19" fill="var(--ka-f1edff)" stroke="var(--kl-e4dcff)" />
      <line x1="20" y1="6" x2="20" y2="10" stroke="var(--kl-6d28d9)" stroke-width="1.6" /><circle cx="20" cy="5.5" r="1.8" fill="var(--ka-8b5cf6)" />
      <rect x="9" y="10" width="22" height="17" rx="7" fill="var(--ka-ffffff)" stroke="var(--kl-c4b5fd)" />
      <rect x="11.5" y="13" width="17" height="11" rx="5" fill="var(--ka-2e1065)" />
      <ellipse cx="16.5" cy="18" rx="2" ry="2.4" fill="var(--ka-a78bfa)" /><ellipse cx="23.5" cy="18" rx="2" ry="2.4" fill="var(--ka-a78bfa)" />
      <rect x="6.5" y="15" width="3" height="7" rx="1.5" fill="var(--ka-8b5cf6)" /><rect x="30.5" y="15" width="3" height="7" rx="1.5" fill="var(--ka-8b5cf6)" />
      <path d="M13 34c1-4 4-6 7-6s6 2 7 6" fill="var(--ka-ffffff)" stroke="var(--kl-c4b5fd)" />
    </svg>
  `,
})
export class BotAvatar {
  readonly size = input(34);
}

/* ---------------- One chat message ---------------- */
@Component({
  selector: 'ai-msg',
  imports: [...UI, BotAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = msg();
    @if (m.role === 'user') {
      <div class="u-row">
        <div class="u-col">
          <div class="u-bubble">{{ m.text }}</div>
          <span class="time">{{ m.time }}</span>
        </div>
        <span class="u-av">RK</span>
      </div>
    } @else {
      <div class="b-row">
        <ai-bot-avatar [size]="30" />
        <div class="b-col">
          <div class="b-bubble">
            @for (b of blocks(); track $index) {
              @switch (b.t) {
                @case ('text') {<p class="m-text">{{ b.text }}@if (!done() && $last) {<i class="caret"></i>}</p>}
                @case ('list') {<ul class="m-list">@for (it of b.items; track $index) {<li>{{ it }}</li>}</ul>}
                @case ('table') {
                  <div class="m-table-wrap">
                    <table class="m-table">
                      <thead><tr>@for (c of b.cols; track c) {<th>{{ c }}</th>}</tr></thead>
                      <tbody>
                        @for (r of (m.expanded || !b.limit ? b.rows : b.rows.slice(0, b.limit)); track $index) {
                          <tr>
                            @for (c of r; track $index) {
                              <td [class.num]="isNum(c)">
                                @if (isObj(c)) {
                                  @if (c.av) {<span class="m-person"><span class="m-av" [style.background]="c.color">{{ c.av }}</span>{{ c.text }}</span>}
                                  @else {<span [class]="c.cls ?? ''">{{ c.text }}</span>}
                                } @else {<span>{{ c }}</span>}
                              </td>
                            }
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
                @case ('donut') {<div class="m-chart"><app-donut [segments]="b.segs" [center]="b.center" [value]="b.value" [size]="118" /></div>}
                @case ('bars') {
                  <ul class="m-bars">
                    @for (r of b.rows; track r.label) {<li><span>{{ r.label }}</span><div><i [style.width.%]="(r.value / b.max) * 100" [style.background]="r.color ?? 'var(--ka-7c3aed)'"></i></div><b>{{ r.display ?? r.value }}</b></li>}
                  </ul>
                }
                @case ('line') {<div class="m-chart"><app-line-chart [labels]="b.labels" [series]="b.series" [height]="170" [legend]="b.series.length > 1" [suffix]="b.suffix ?? ''" /></div>}
                @case ('column') {<div class="m-chart"><app-column-chart [labels]="b.labels" [series]="b.series" [height]="170" [legend]="b.series.length > 1" [stacked]="!!b.stacked" /></div>}
                @case ('kpis') {<div class="m-kpis">@for (k of b.items; track k.label) {<div><b [style.color]="k.color">{{ k.value }}</b><small>{{ k.label }}</small></div>}</div>}
                @case ('person') {
                  <div class="m-pcard">
                    <span class="m-av lg" [style.background]="b.emp.avatar">{{ b.emp.initials }}</span>
                    <div class="pc-main"><b>{{ b.emp.name }}</b><small>{{ b.emp.role }} · {{ b.emp.dept }} · {{ b.emp.id }}</small>
                      <span class="pc-st"><i [class]="'st ' + b.emp.status.replace(' ', '')"></i>{{ b.emp.status }} · {{ b.emp.site }}</span></div>
                    <dl>
                      <dt>Overtime (wk)</dt><dd>{{ b.emp.overtime }} h</dd><dt>Late (month)</dt><dd>{{ b.emp.late }}</dd>
                      <dt>Attrition risk</dt><dd [class.red-t]="b.emp.risk >= 60">{{ b.emp.risk }}%</dd><dt>Engagement</dt><dd>{{ b.emp.engagement }}/100</dd>
                      <dt>Tenure</dt><dd>{{ b.emp.tenure }} yrs</dd><dt>Certification</dt><dd>{{ b.emp.cert ? b.emp.cert.name + ' · ' + b.emp.cert.days + 'd left' : 'All valid' }}</dd>
                    </dl>
                  </div>
                }
              }
            }
            @if (done()) {
              <div class="b-foot">
                <span class="time">{{ m.time }}</span>
                <button title="Copy" (click)="copy.emit()"><app-icon name="ai-copy" [size]="14" /></button>
                <button title="Helpful" [class.on]="m.rating === 'up'" (click)="rate.emit('up')"><app-icon name="ai-thumb-up" [size]="14" /></button>
                <button title="Not helpful" [class.on]="m.rating === 'down'" (click)="rate.emit('down')"><app-icon name="ai-thumb-down" [size]="14" /></button>
              </div>
            }
          </div>
          @if (done() && m.suggestions?.length) {
            <div class="sugs">@for (s of m.suggestions; track s) {<button (click)="prompt.emit(s)">{{ s }}</button>}</div>
          }
        </div>
      </div>
      @if (done() && m.actions?.length) {
        <div class="acts">
          @for (a of m.actions; track a.label) {
            <button class="act" [class.primary]="a.primary" [class.ok]="isDone(a)" [disabled]="isDone(a)" (click)="act.emit(a)">
              @if (isDone(a)) {<app-icon name="ai-check" [size]="13" [stroke]="2.6" />}{{ label(a) }}
            </button>
          }
          <div class="menu-wrap">
            <button class="act dots-btn" (click)="menu.set(!menu())" aria-label="More">⋮</button>
            @if (menu()) {
              <div class="dropdown right">
                <button class="dd-item" (click)="menu.set(false); copy.emit()">Copy answer</button>
                <button class="dd-item" (click)="menu.set(false); exportCsv()">Export as CSV</button>
                <button class="dd-item" (click)="menu.set(false); pin.emit()">Save as report</button>
              </div>
            }
          </div>
        </div>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .u-row { display: flex; justify-content: flex-end; gap: 10px; align-items: flex-start; }
    .u-col { display: flex; flex-direction: column; align-items: flex-end; max-width: 82%; }
    .u-bubble { background: var(--kb-ece8ff); color: var(--kf-2b2560); padding: 10px 14px; border-radius: 12px 4px 12px 12px; font-size: 12.5px; line-height: 1.45; }
    .u-av { width: 30px; height: 30px; border-radius: 50%; background: var(--kb-7c3aed); color: var(--kf-ffffff); font-size: 11.5px; font-weight: 600; display: grid; place-items: center; flex: none; }
    .time { font-size: 10px; color: var(--kf-8a8fa8); margin-top: 4px; }
    .b-row { display: flex; gap: 6px; align-items: flex-start; }
    .b-col { flex: 1; min-width: 0; }
    .b-bubble { background: var(--kb-faf9ff); border: 1px solid var(--kl-eeebfa); border-radius: 4px 12px 12px 12px; padding: 10px 10px 6px; }
    .m-text { margin: 0 0 8px; font-size: 12.5px; line-height: 1.5; color: var(--kf-2a2d48); white-space: pre-line; }
    .caret { display: inline-block; width: 6px; height: 13px; background: var(--kb-7c3aed); margin-left: 2px; vertical-align: -2px; animation: blink 0.8s infinite; }
    @keyframes blink { 50% { opacity: 0; } }
    .m-list { margin: 0 0 8px; padding-left: 18px; font-size: 12.5px; line-height: 1.6; color: var(--kf-2a2d48); }
    .m-table-wrap { overflow-x: auto; margin-bottom: 4px; border: 1px solid var(--kl-eceaf6); border-radius: 6px; background: var(--kb-ffffff); }
    .m-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    .m-table th { background: var(--kb-f6f5fc); text-align: left; font-weight: 600; color: var(--kf-2a2d48); padding: 6px 4px; white-space: nowrap; border-bottom: 1px solid var(--kl-eceaf6); }
    .m-table td { padding: 4px 4px; border-bottom: 1px solid var(--kl-f1f0f8); color: var(--kf-3a3d58); white-space: nowrap; }
    .m-table td + td, .m-table th + th { border-left: 1px solid var(--kl-f1f0f8); }
    .m-table tr:last-child td { border-bottom: 0; }
    .red-t { color: var(--kf-dc2626); }
    .pill { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: 500; min-width: 44px; text-align: center; }
    .pill.green { background: var(--kb-d9f7e3); color: var(--kf-15803d); } .pill.lime { background: var(--kb-e8f7d4); color: var(--kf-4d7c0f); } .pill.amber { background: var(--kb-fdefd3); color: var(--kf-b45309); } .pill.red { background: var(--kb-fde2e2); color: var(--kf-dc2626); } .pill.blue { background: var(--kb-dbeafe); color: var(--kf-1d4ed8); }
    .days { display: inline-block; min-width: 34px; text-align: center; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
    .days.red { background: var(--kb-fde2e2); color: var(--kf-dc2626); } .days.amber { background: var(--kb-fdecdc); color: var(--kf-c2410c); } .days.orange { background: var(--kb-fdf4dc); color: var(--kf-a16207); }
    .m-person { display: inline-flex; align-items: center; gap: 5px; }
    .m-av { width: 19px; height: 19px; border-radius: 50%; color: var(--kf-ffffff); font-size: 8.5px; font-weight: 600; display: inline-grid; place-items: center; flex: none; }
    .m-av.lg { width: 44px; height: 44px; font-size: 15px; }
    .m-chart { background: var(--kb-ffffff); border: 1px solid var(--kl-eceaf6); border-radius: 8px; padding: 8px; margin-bottom: 8px; }
    .m-bars { list-style: none; margin: 0 0 8px; padding: 8px 10px; background: var(--kb-ffffff); border: 1px solid var(--kl-eceaf6); border-radius: 8px; display: flex; flex-direction: column; gap: 7px; }
    .m-bars li { display: grid; grid-template-columns: 96px 1fr 76px; gap: 8px; align-items: center; font-size: 11.5px; }
    .m-bars div { height: 9px; background: var(--kb-f0f1f7); border-radius: 2px; overflow: hidden; } .m-bars i { display: block; height: 100%; }
    .m-bars b { font-weight: 600; text-align: right; }
    .m-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px; }
    .m-kpis div { background: var(--kb-ffffff); border: 1px solid var(--kl-eceaf6); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; }
    .m-kpis b { font-size: 17px; } .m-kpis small { font-size: 10.5px; color: var(--kf-6b7090); }
    .m-pcard { display: grid; grid-template-columns: 44px 1fr; gap: 10px; background: var(--kb-ffffff); border: 1px solid var(--kl-eceaf6); border-radius: 8px; padding: 10px; margin-bottom: 8px; }
    .pc-main { display: flex; flex-direction: column; font-size: 12.5px; } .pc-main small { color: var(--kf-6b7090); font-size: 11px; }
    .pc-st { font-size: 11px; display: inline-flex; align-items: center; gap: 5px; margin-top: 2px; }
    .st { width: 7px; height: 7px; border-radius: 50%; background: var(--kb-22c55e); } .st.Late { background: var(--kb-f59e0b); } .st.Absent { background: var(--kb-ef4444); } .st.OnLeave { background: var(--kb-64748b); } .st.Remote { background: var(--kb-3b82f6); }
    .m-pcard dl { grid-column: 1 / -1; display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 4px 10px; margin: 0; font-size: 11px; }
    .m-pcard dt { color: var(--kf-6b7090); } .m-pcard dd { margin: 0; font-weight: 600; }
    .b-foot { display: flex; justify-content: flex-end; align-items: center; gap: 4px; margin-top: 2px; }
    .b-foot .time { margin: 0 6px 0 0; }
    .b-foot button { border: 0; background: none; color: var(--kf-6b7090); cursor: pointer; padding: 3px; border-radius: 4px; display: grid; }
    .b-foot button:hover { background: var(--kb-efeafd); color: var(--kf-7c3aed); } .b-foot button.on { color: var(--kf-7c3aed); background: var(--kb-efeafd); }
    .sugs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .sugs button { border: 1px solid var(--kl-ddd6fe); background: var(--kb-ffffff); color: var(--kf-6d28d9); border-radius: 14px; padding: 4px 10px; font-size: 11.5px; cursor: pointer; }
    .sugs button:hover { background: var(--kb-f5f3ff); }
    .acts { display: flex; gap: 6px; justify-content: flex-end; margin: 10px 0 0 30px; flex-wrap: wrap; }
    .act { border: 1px solid var(--kl-dcd7f0); background: var(--kb-ffffff); color: var(--kf-5b21b6); border-radius: 6px; padding: 7px 12px; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
    .act:hover:not(:disabled) { border-color: var(--kl-a78bfa); background: var(--kb-faf8ff); }
    .act.primary { background: var(--kb-7c3aed); color: var(--kf-ffffff); border-color: var(--kl-7c3aed); }
    .act.ok { color: var(--kf-15803d); border-color: var(--kl-bbf7d0); background: var(--kb-f0fdf4); cursor: default; }
    .dots-btn { padding: 7px 10px; font-weight: 700; }
    .dropdown.right { right: 0; left: auto; }
  `,
})
export class ChatMsg {
  readonly msg = input.required<Msg>();
  readonly blocks = input.required<Block[]>();
  readonly done = input(true);
  readonly doneActs = input<Set<string>>(new Set());
  readonly act = output<ChatAction>();
  readonly rate = output<'up' | 'down'>();
  readonly copy = output<void>();
  readonly pin = output<void>();
  readonly prompt = output<string>();
  protected readonly menu = signal(false);
  protected isObj(c: Cell): c is Exclude<Cell, string | number> {
    return typeof c === 'object';
  }
  protected isNum(c: Cell) {
    return typeof c === 'number';
  }
  protected isDone(a: ChatAction) {
    return this.doneActs().has(this.msg().id + ':' + a.label);
  }
  protected label(a: ChatAction) {
    if (a.kind === 'expand' && this.msg().expanded) return 'Show Less';
    if (this.isDone(a)) return a.kind === 'remind' ? 'Reminder Sent' : a.kind === 'task' ? 'Task Created' : a.kind === 'book' ? 'Booked' : a.kind === 'alert' ? 'Alert Set' : a.label;
    return a.label;
  }
  protected exportCsv() {
    exportMsg(this.msg());
  }
}
