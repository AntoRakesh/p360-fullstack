// Shared Safety & Wellbeing pieces: styles, toast, report-incident modal, incident drawer, illustrated camera.
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Icon } from '../../shared/icon';
import { SelectValue } from '../../shared/select-value';
import { dayLabel, FLOORS, I_STATUSES, I_TYPES, Incident, IStatus, LOCATIONS, OFFICERS, SafetyStore, Sev, SEVS, SITES, sevTag, stCls } from './safety.data';

/** Pill styles used by several safety pages (component styles are encapsulated). */
export const SF_STYLES = `
  .sev { display: inline-block; min-width: 54px; padding: 3px 10px; border-radius: 5px; font-size: 11.5px; font-weight: 500; text-align: center; }
  .sev.red { background: var(--kb-fde2e2); color: var(--kf-dc2626); } .sev.amber { background: var(--kb-fef3c7); color: var(--kf-b45309); } .sev.green { background: var(--kb-dcfce7); color: var(--kf-15803d); }
  .st { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 5px; font-size: 11.5px; white-space: nowrap; }
  .st::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .st.red { background: var(--kb-fde2e2); color: var(--kf-dc2626); } .st.orange { background: var(--kb-ffedd5); color: var(--kf-ea580c); } .st.blue { background: var(--kb-dbeafe); color: var(--kf-2563eb); }
  .st.purple { background: var(--kb-ede9fe); color: var(--kf-5b21b6); } .st.green { background: var(--kb-dcfce7); color: var(--kf-15803d); } .st.grey { background: var(--kb-eef0f5); color: var(--kf-4b5563); }
  .btn-red { display: inline-flex; gap: 8px; align-items: center; height: 40px; padding: 0 18px; border: 0; border-radius: 8px; background: var(--kb-e5162b); color: var(--kf-ffffff); font: inherit; font-weight: 600; font-size: 13.5px; cursor: pointer; }
  .btn-red:hover { background: var(--kb-c81424); }
  .av { width: 30px; height: 30px; border-radius: 50%; display: inline-grid; place-items: center; color: var(--kf-ffffff); font-size: 11px; font-weight: 700; flex: none; }
  .ic-sq { width: 30px; height: 30px; border-radius: 8px; display: inline-grid; place-items: center; flex: none; }
  .lnk { color: var(--primary); font-weight: 600; font-size: 13px; text-decoration: none; background: none; border: 0; cursor: pointer; padding: 0; font-family: inherit; }
  .segs { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .segs button { border: 0; background: var(--kb-ffffff); padding: 7px 12px; font: inherit; font-size: 12.5px; cursor: pointer; color: var(--kf-4b4f6b); } .segs button + button { border-left: 1px solid var(--border); }
  .segs button.on { background: var(--primary); color: var(--kf-ffffff); }
  .dl { display: grid; grid-template-columns: 130px 1fr; gap: 8px 10px; margin: 0; font-size: 12.5px; } .dl dt { color: var(--muted); } .dl dd { margin: 0; }
  .tl { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--kl-ece9f8); } .tl li { position: relative; padding: 0 0 12px 8px; font-size: 12.5px; }
  .tl li::before { content: ''; position: absolute; left: -21px; top: 3px; width: 10px; height: 10px; border-radius: 50%; background: var(--primary); border: 2px solid var(--kl-ffffff); }
  .tl small { display: block; color: var(--muted); font-size: 11px; }
  .sec-h { font-size: 13px; margin: 16px 0 8px; font-weight: 600; }
  .grid2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  .grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .kpi6 { grid-template-columns: repeat(6, minmax(0, 1fr)); } .kpi5 { grid-template-columns: repeat(5, minmax(0, 1fr)); } .kpi4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .split { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 12px; align-items: start; }
  .side { position: sticky; top: 76px; max-height: calc(100vh - 92px); overflow: auto; }
  .card h3 { margin: 0; font-size: 16px; }
  .chk { display: flex; gap: 8px; align-items: center; padding: 7px 0; font-size: 12.5px; border-bottom: 1px solid var(--kl-f1f2f7); cursor: pointer; } .chk input { accent-color: var(--primary); }
  .bar { height: 8px; border-radius: 4px; background: var(--kb-eef0f6); overflow: hidden; } .bar i { display: block; height: 100%; border-radius: 4px; }
  @media (max-width: 1400px) { .kpi6 { grid-template-columns: repeat(3, minmax(0, 1fr)); } .split { grid-template-columns: 1fr; } .side { position: static; max-height: none; } }
  @media (max-width: 1100px) { .kpi5, .kpi4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .grid3, .grid2 { grid-template-columns: 1fr; } }
`;

@Component({
  selector: 'app-sf-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (store.toastMsg()) {<div class="g-toast">{{ store.toastMsg() }}</div>}`,
})
export class SfToast {
  protected readonly store = inject(SafetyStore);
}

/* ---------------- Report incident modal ---------------- */
@Component({
  selector: 'app-sf-report',
  imports: [Icon, SelectValue],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.reportOpen(); as f) {
      <div class="g-overlay" (click)="store.reportOpen.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save(f)">
        <div class="modal-head"><h3><app-icon name="siren" [size]="18" /> Report Incident</h3><button type="button" class="close-btn" (click)="store.reportOpen.set(null)">×</button></div>
        <div class="types">
          @for (t of types; track t) {
            <button type="button" [class.on]="f.type === t" (click)="set('type', t)"><app-icon [name]="meta[t].icon" [size]="18" [style.color]="meta[t].color" />{{ t }}</button>
          }
        </div>
        <div class="form-grid">
          <label class="full">Title<input class="input" [value]="f.title ?? ''" [placeholder]="(f.type ?? 'Incident') + ' – ' + (f.location ?? '')" (input)="set('title', $any($event.target).value)" /></label>
          <label>Site<select class="select" [value]="f.site ?? 'Head Office'" (change)="set('site', $any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label>Floor<select class="select" [value]="f.floor ?? 'Floor 2'" (change)="set('floor', $any($event.target).value)">@for (s of floors; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label>Location<select class="select" [value]="f.location ?? 'Production Area'" (change)="set('location', $any($event.target).value)">@for (s of locations; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label>Assign to<select class="select" [value]="f.assignee ?? 'Sarah Johnson'" (change)="set('assignee', $any($event.target).value)">@for (s of officers; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label class="full">Severity
            <div class="sevs">@for (s of sevs; track s) {<button type="button" [class]="'sv ' + s.toLowerCase()" [class.on]="(f.severity ?? 'Medium') === s" (click)="set('severity', s)">{{ s }}</button>}</div>
          </label>
          <label>People injured<input class="input" type="number" min="0" [value]="f.injured ?? 0" (input)="set('injured', +$any($event.target).value)" /></label>
          <label>People involved<input class="input" placeholder="e.g. Arjun Mehta, Priya Nair" (input)="set('involved', $any($event.target).value.split(',').map(trim).filter(trim))" /></label>
          <label class="full">What happened? *<textarea class="input ta" required [value]="f.description ?? ''" (input)="set('description', $any($event.target).value)"></textarea></label>
        </div>
        <label class="notify"><input type="checkbox" checked /> Notify site safety officer & ERT by push + SMS</label>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="store.reportOpen.set(null)">Cancel</button><button class="btn-red" type="submit"><app-icon name="s-send" [size]="15" />Submit Report</button></div>
      </form>
    }
  `,
  styles: [SF_STYLES, `
    h3 { display: flex; gap: 8px; align-items: center; margin: 0; color: var(--kf-dc2626); }
    .types { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 14px; }
    .types button { display: flex; gap: 6px; align-items: center; padding: 8px; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 8px; font: inherit; font-size: 12px; cursor: pointer; text-align: left; }
    .types button.on { border-color: var(--primary); background: var(--kb-faf8ff); box-shadow: 0 0 0 2px var(--primary-soft); }
    .sevs { display: flex; gap: 6px; } .sv { flex: 1; height: 34px; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 8px; font: inherit; font-size: 12.5px; cursor: pointer; }
    .sv.on.critical { background: var(--kb-7f1d1d); color: var(--kf-ffffff); } .sv.on.high { background: var(--kb-dc2626); color: var(--kf-ffffff); } .sv.on.medium { background: var(--kb-f59e0b); color: var(--kf-ffffff); } .sv.on.low { background: var(--kb-16a34a); color: var(--kf-ffffff); }
    .ta { height: 80px; padding-top: 8px; resize: vertical; } .notify { display: flex; gap: 8px; align-items: center; margin-top: 12px; font-size: 12.5px; }
  `],
})
export class ReportIncident {
  protected readonly store = inject(SafetyStore);
  protected readonly meta = I_TYPES;
  protected readonly types = Object.keys(I_TYPES);
  protected readonly sites = SITES;
  protected readonly floors = FLOORS;
  protected readonly locations = LOCATIONS;
  protected readonly officers = OFFICERS;
  protected readonly sevs = SEVS;
  protected readonly trim = (s: string) => s.trim();
  protected set<K extends keyof Incident>(k: K, v: Incident[K]) {
    this.store.reportOpen.update((f) => ({ ...f, [k]: v }));
  }
  protected save(f: Partial<Incident>) {
    const inc = this.store.addIncident({ type: 'Near Miss', site: 'Head Office', floor: 'Floor 2', location: 'Production Area', severity: 'Medium', ...f });
    this.store.reportOpen.set(null);
    this.store.toast(`${inc.id} reported · ${inc.assignee} and ERT notified`);
  }
}

/* ---------------- Incident detail drawer ---------------- */
@Component({
  selector: 'app-sf-incident-drawer',
  imports: [Icon, SelectValue],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (inc(); as i) {
      <div class="g-overlay" (click)="store.openIncident.set(null)"></div>
      <aside class="g-drawer wide">
        <div class="dh">
          <span class="ic-sq big" [style.background]="'color-mix(in srgb, ' + meta(i.type).color + ' 12%, transparent)'" [style.color]="meta(i.type).color"><app-icon [name]="meta(i.type).icon" [size]="22" /></span>
          <div><h3>{{ i.title }}</h3><small class="muted">{{ i.id }} · {{ i.type }} · {{ when(i) }}</small></div>
          <button class="close-btn" (click)="store.openIncident.set(null)">×</button>
        </div>
        <div class="pills"><span [class]="sevTag(i.severity)">{{ i.severity }}</span><span [class]="stCls(i.status)">{{ i.status }}</span>@if (i.lti) {<span class="tag red">Lost Time Injury</span>}</div>
        <div class="acts">
          <label>Status<select class="select" [value]="i.status" (change)="setStatus(i, $any($event.target).value)">@for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label>Assignee<select class="select" [value]="i.assignee" (change)="assign(i, $any($event.target).value)">@for (s of officers; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label>Severity<select class="select" [value]="i.severity" (change)="sev(i, $any($event.target).value)">@for (s of sevs; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        </div>
        <dl class="dl">
          <dt>Location</dt><dd>{{ i.location }} · {{ i.floor }} · {{ i.site }}</dd>
          <dt>Source</dt><dd>{{ i.source }} · {{ i.reportedBy }}</dd>
          <dt>People involved</dt><dd>{{ i.involved.join(', ') || '—' }}</dd>
          <dt>Injuries</dt><dd>{{ i.injured }}</dd>
          <dt>Root cause</dt><dd>{{ i.rootCause ?? 'Pending investigation' }}</dd>
        </dl>
        <p class="desc">{{ i.description }}</p>
        <div class="sec-h">Timeline</div>
        <ul class="tl">@for (l of i.log; track $index) {<li>{{ l.text }}<small>{{ l.at }} · {{ l.by }}</small></li>}</ul>
        <div class="note"><input class="input" placeholder="Add an update to the timeline…" [value]="note()" (input)="note.set($any($event.target).value)" (keydown.enter)="addNote(i)" /><button class="btn-primary" (click)="addNote(i)">Add</button></div>
        @if (closing()) {
          <div class="close-box">
            <label>Root cause<select class="select" [value]="root()" (change)="root.set($any($event.target).value)">@for (r of roots; track r) {<option [value]="r">{{ r }}</option>}</select></label>
            <button class="btn-primary" (click)="close(i)"><app-icon name="s-check" [size]="15" />Confirm close</button>
          </div>
        }
        <div class="foot">
          <button class="btn-outline" (click)="escalate(i)"><app-icon name="bell-ring" [size]="15" />Escalate</button>
          <button class="btn-outline" (click)="locate(i)"><app-icon name="map-pin" [size]="15" />Show on Map</button>
          @if (i.status !== 'Closed') {<button class="btn-primary" (click)="closing.set(true)"><app-icon name="s-check" [size]="15" />Close Incident</button>}
        </div>
      </aside>
    }
  `,
  styles: [SF_STYLES, `
    .dh { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; } .dh h3 { margin: 0; font-size: 17px; } .big { width: 46px; height: 46px; border-radius: 12px; }
    .pills { display: flex; gap: 8px; margin: 12px 0; }
    .acts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; } .acts label { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--muted); }
    .desc { font-size: 13px; line-height: 1.5; background: var(--kb-f8f8fc); border-radius: 8px; padding: 10px 12px; }
    .note { display: flex; gap: 8px; margin-top: 4px; } .note .input { flex: 1; }
    .close-box { display: flex; gap: 8px; align-items: flex-end; margin-top: 12px; padding: 10px; border: 1px dashed var(--border); border-radius: 8px; } .close-box label { flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
    .foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border); flex-wrap: wrap; }
  `],
})
export class IncidentDrawer {
  protected readonly store = inject(SafetyStore);
  private readonly router = inject(Router);
  protected readonly inc = computed(() => this.store.incident(this.store.openIncident()));
  protected readonly statuses = I_STATUSES;
  protected readonly officers = OFFICERS;
  protected readonly sevs = SEVS;
  protected readonly roots = ['Inadequate training', 'Missing machine guard', 'Wet floor not signposted', 'PPE not worn', 'Procedure not followed', 'Poor housekeeping', 'Worn equipment', 'Sensor fault / false alarm'];
  protected readonly note = signal('');
  protected readonly closing = signal(false);
  protected readonly root = signal(this.roots[0]);
  protected readonly sevTag = sevTag;
  protected readonly stCls = stCls;
  protected meta(t: string) {
    return I_TYPES[t] ?? I_TYPES['Near Miss'];
  }
  protected when(i: Incident) {
    return `${i.daysAgo ? dayLabel(i.daysAgo) : 'Today'}, ${i.time}`;
  }
  protected setStatus(i: Incident, s: IStatus) {
    this.store.updateIncident(i.id, { status: s }, `Status changed to ${s}`);
    this.store.toast(`${i.id} → ${s}`);
  }
  protected assign(i: Incident, a: string) {
    this.store.updateIncident(i.id, { assignee: a }, `Reassigned to ${a}`);
    this.store.toast(`${i.id} assigned to ${a}`);
  }
  protected sev(i: Incident, s: Sev) {
    this.store.updateIncident(i.id, { severity: s }, `Severity set to ${s}`);
  }
  protected addNote(i: Incident) {
    if (!this.note().trim()) return;
    this.store.updateIncident(i.id, {}, this.note().trim());
    this.note.set('');
  }
  protected close(i: Incident) {
    this.store.updateIncident(i.id, { status: 'Closed', rootCause: this.root() }, `Closed – root cause: ${this.root()}`);
    this.closing.set(false);
    this.store.toast(`${i.id} closed`);
  }
  protected escalate(i: Incident) {
    this.store.updateIncident(i.id, { severity: i.severity === 'Low' ? 'Medium' : i.severity === 'Medium' ? 'High' : 'Critical' }, 'Escalated to HSE Manager & Site Director');
    this.store.toast(`${i.id} escalated to HSE Manager`);
  }
  protected locate(i: Incident) {
    this.store.openIncident.set(null);
    this.router.navigate(['/safety-wellbeing/safety-command-center'], { queryParams: { floor: i.floor } });
  }
}

/* ---------------- Illustrated CCTV frame ---------------- */
@Component({
  selector: 'app-sf-cam',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 160 110" preserveAspectRatio="xMidYMid slice">
      @switch (variant()) {
        @case (1) {
          <!-- corridor / entrance -->
          <rect width="160" height="110" fill="var(--ka-c9ccd1)" />
          <path d="M0 0h160v14H0z" fill="var(--ka-e8e9eb)" /><path d="M0 0l52 30v50L0 110z" fill="var(--ka-a9adb4)" /><path d="M160 0l-52 30v50l52 30z" fill="var(--ka-b2b6bc)" />
          <rect x="52" y="30" width="56" height="50" fill="var(--ka-dfe2e6)" /><rect x="66" y="40" width="28" height="40" fill="var(--ka-8b95a1)" /><rect x="74" y="32" width="12" height="5" fill="var(--ka-16a34a)" />
          <path d="M0 110l52-30h56l52 30z" fill="var(--ka-9aa1a9)" /><path d="M78 80h4l10 30h-24z" fill="var(--ka-facc15)" opacity=".55" />
          @for (r of [0, 1, 2, 3]; track r) {<rect [attr.x]="56 + r * 13" y="16" width="9" height="3" fill="var(--ka-ffffff)" />}
        }
        @case (2) {
          <!-- warehouse aisle with forklift -->
          <rect width="160" height="110" fill="var(--ka-7d8794)" /><path d="M0 72h160v38H0z" fill="var(--ka-8f949b)" />
          @for (x of [0, 118]; track x) {
            <g [attr.transform]="'translate(' + x + ' 0)'">
              <rect width="42" height="74" fill="var(--ka-5b6675)" />
              @for (y of [14, 34, 54]; track y) {<rect x="0" [attr.y]="y" width="42" height="3" fill="var(--ka-f97316)" />@for (b of [3, 16, 29]; track b) {<rect [attr.x]="b" [attr.y]="y - 11" width="11" height="11" fill="var(--ka-c8a173)" />}}
              <rect x="0" y="0" width="3" height="74" fill="var(--ka-2563eb)" /><rect x="39" y="0" width="3" height="74" fill="var(--ka-2563eb)" />
            </g>
          }
          <path d="M60 110l14-38h12l14 38z" fill="var(--ka-a0a4aa)" /><path d="M78 72v38" stroke="var(--kl-facc15)" stroke-width="1.5" stroke-dasharray="4 3" />
          <!-- forklift -->
          <g [attr.transform]="'translate(' + (40 + shift()) + ' 54)'">
            <rect x="0" y="16" width="34" height="18" rx="3" fill="var(--ka-f59e0b)" /><rect x="6" y="0" width="20" height="18" fill="none" stroke="var(--kl-1f2937)" stroke-width="2.5" />
            <rect x="34" y="-4" width="3" height="38" fill="var(--ka-374151)" /><rect x="37" y="28" width="12" height="3" fill="var(--ka-374151)" />
            <circle cx="8" cy="35" r="5" fill="var(--ka-111827)" /><circle cx="28" cy="35" r="5" fill="var(--ka-111827)" />
          </g>
        }
        @default {
          <!-- warehouse racking -->
          <rect width="160" height="110" fill="var(--ka-6b7686)" /><path d="M0 74h160v36H0z" fill="var(--ka-9aa0a7)" />
          @for (x of [-6, 104]; track x) {
            <g [attr.transform]="'translate(' + x + ' 0)'">
              <rect width="62" height="76" fill="var(--ka-4a5565)" />
              @for (y of [12, 32, 52]; track y) {<rect x="0" [attr.y]="y" width="62" height="3" fill="var(--ka-f97316)" />@for (b of [4, 18, 32, 46]; track b) {<rect [attr.x]="b" [attr.y]="y - 10" width="12" height="10" [attr.fill]="b % 28 ? 'var(--ka-d4a373)' : 'var(--ka-3b82f6)'" />}}
              @for (u of [0, 30, 59]; track u) {<rect [attr.x]="u" y="0" width="3" height="76" fill="var(--ka-2563eb)" />}
            </g>
          }
          <path d="M56 110l12-36h24l12 36z" fill="var(--ka-b5b9be)" />
        }
      }
      <!-- workers -->
      @for (p of people(); track $index) {
        <g [attr.transform]="'translate(' + (p.x + (p.walk ? shift() : 0)) + ' ' + p.y + ') scale(' + p.s + ')'">
          <rect x="-4" y="14" width="3.4" height="13" fill="var(--ka-1f2937)" /><rect x="0.6" y="14" width="3.4" height="13" fill="var(--ka-1f2937)" />
          <rect x="-6" y="0" width="12" height="16" rx="2.5" [attr.fill]="p.vest ? 'var(--ka-d9f99d)' : 'var(--ka-475569)'" />
          @if (p.vest) {<rect x="-6" y="7" width="12" height="2" fill="var(--ka-f8fafc)" opacity=".9" />}
          <circle cx="0" cy="-5" r="4.4" fill="var(--ka-c58c62)" />
          @if (p.helmet) {<path d="M-5 -6a5 5 0 0 1 10 0z" fill="var(--ka-facc15)" /><rect x="-5.8" y="-6.5" width="11.6" height="1.6" fill="var(--ka-eab308)" />}
          @else {<path d="M-4.3 -6.5a4.4 4.4 0 0 1 8.6 0z" fill="var(--ka-2b1d14)" />}
        </g>
      }
      @if (box()) {
        <rect [attr.x]="box()!.x + shift()" [attr.y]="box()!.y" [attr.width]="box()!.w" [attr.height]="box()!.h" fill="none" [attr.stroke]="box()!.c" stroke-width="1.4" />
      }
    </svg>
    @if (live()) {<span class="lv"><i></i>Live</span>}
    @if (alert()) {<span class="al" [style.left.%]="alertPos()[0]" [style.top.%]="alertPos()[1]">{{ alert() }}</span>}
  `,
  styles: `
    :host { display: block; position: relative; overflow: hidden; background: var(--kb-6b7686); } svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .lv { position: absolute; left: 6px; top: 6px; display: flex; gap: 5px; align-items: center; padding: 2px 8px; border-radius: 4px; background: var(--kb-16a34a); color: var(--kf-ffffff); font-size: 11px; font-weight: 600; }
    .lv i { width: 7px; height: 7px; border-radius: 50%; background: var(--kb-ffffff); animation: b 1.4s infinite; } @keyframes b { 50% { opacity: .3; } }
    .al { position: absolute; transform: translateX(-50%); padding: 2px 6px; background: var(--kb-e11d2e); color: var(--kf-ffffff); font-size: 10.5px; font-weight: 600; border-radius: 2px; white-space: nowrap; }
  `,
})
export class SafetyCam {
  readonly variant = input(0);
  readonly alert = input('');
  readonly live = input(true);
  readonly tick = input(0);
  protected readonly shift = computed(() => (this.tick() % 8) - 4);
  protected readonly people = computed(() => {
    const v = this.variant();
    if (v === 1) return [
      { x: 64, y: 70, s: 1.15, vest: true, helmet: true, walk: true }, { x: 92, y: 72, s: 1.1, vest: true, helmet: true, walk: false }, { x: 80, y: 60, s: 0.7, vest: true, helmet: true, walk: true },
    ];
    if (v === 2) return [{ x: 118, y: 66, s: 1.1, vest: true, helmet: false, walk: false }, { x: 140, y: 64, s: 0.8, vest: true, helmet: true, walk: false }];
    return [
      { x: 80, y: 62, s: 1.35, vest: true, helmet: false, walk: false }, { x: 52, y: 66, s: 0.9, vest: true, helmet: true, walk: true }, { x: 112, y: 64, s: 0.85, vest: true, helmet: true, walk: false },
    ];
  });
  protected readonly box = computed(() => {
    if (!this.alert()) return null;
    const v = this.variant();
    return v === 2 ? { x: 106, y: 52, w: 24, h: 46, c: 'var(--ka-ef4444)' } : v === 1 ? { x: 56, y: 60, w: 18, h: 40, c: 'var(--ka-22c55e)' } : { x: 70, y: 48, w: 20, h: 50, c: 'var(--ka-ef4444)' };
  });
  protected readonly alertPos = computed(() => (this.variant() === 2 ? [74, 38] : [50, 38]));
}
