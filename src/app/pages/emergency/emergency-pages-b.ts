import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv, rng } from '../dashboards/demo-data';
import { EmergencyStore, Evacuation, fmtClock, fmtTimer } from './emergency.data';
import { INCIDENT_TYPES, TEMPLATES } from './emergency-modals';

const PARENT = 'Emergency & Mustering';
const LINK = '/emergency-mustering';
const toast = (s: { set: (v: string | null) => void }, m: string) => {
  s.set(m);
  setTimeout(() => s.set(null), 2400);
};
const fmtD = (t: number | string) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/* ======================= Events & Drills ======================= */
interface Drill {
  id: string;
  date: string;
  time: string;
  site: string;
  type: string;
  scope: string;
  lead: string;
  notice: string;
}

@Component({
  selector: 'app-events-drills',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Events &amp; Drills" [parent]="parent" [parentLink]="link" subtitle="Plan evacuation drills and track how fast each site gets everyone out.">
      <button class="btn-outline" (click)="startNow()"><app-icon name="play" [size]="15" />Start Drill Now</button>
      <button class="btn-primary" (click)="open.set(true)"><app-icon name="plus" [size]="16" />Schedule Drill</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Drills (12 months)" value="14" icon="calendar-days" color="var(--ka-7c3aed)" sub="target 12" />
      <app-kpi label="Avg. Evacuation Time" value="8m 42s" icon="clock" color="var(--ka-3b82f6)" change="11%" [up]="false" />
      <app-kpi label="Best Time" value="6m 05s" icon="trending-up" color="var(--ka-22c55e)" sub="Warehouse · Aug" />
      <app-kpi label="Avg. Accounted at 10 min" value="97.6%" icon="user-check" color="var(--ka-f59e0b)" />
    </section>
    <section class="dash">
      <div class="card span-7">
        <div class="card-head"><h3>Evacuation Time by Drill (minutes)</h3></div>
        <app-column-chart [labels]="months" [series]="times" [height]="220" />
      </div>
      <div class="card span-5">
        <div class="card-head"><h3>Upcoming Drills</h3></div>
        @for (d of drills(); track d.id) {
          <div class="dr"><div class="dt"><b>{{ d.date.slice(8) }}</b><small>{{ mon(d.date) }}</small></div>
            <div class="di"><b>{{ d.type }} · {{ d.site }}</b><small>{{ d.time }} · {{ d.scope }} · {{ d.lead }} · {{ d.notice }}</small></div>
            <button class="close-btn" title="Cancel drill" (click)="cancel(d.id)">×</button></div>
        } @empty {<p class="muted">No drills scheduled</p>}
      </div>
      <div class="card span-12">
        <div class="card-head"><h3>Past Events</h3></div>
        <table class="table">
          <thead><tr><th>ID</th><th>Date</th><th>Type</th><th>Location</th><th>Duration</th><th>Accounted</th><th>Result</th></tr></thead>
          <tbody>
            @for (h of past(); track h.id) {
              <tr><td>{{ h.id }}</td><td>{{ date(h.triggeredAt) }}</td><td>{{ h.type }}</td><td>{{ h.location }}</td><td>{{ dur(h) }}</td><td>{{ h.acc }}%</td>
                <td><span class="tag" [class]="h.acc >= 98 ? 'tag green' : 'tag amber'">{{ h.acc >= 98 ? 'Pass' : 'Needs review' }}</span></td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
    @if (open()) {
      <div class="g-overlay" (click)="open.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); add(d.value, t.value, s.value, ty.value, sc.value, n.value)">
        <div class="modal-head"><h3>Schedule Drill</h3><button type="button" class="close-btn" (click)="open.set(false)">×</button></div>
        <div class="form-grid">
          <label>Date<input #d class="input" type="date" required [value]="nextWeek" /></label>
          <label>Time<input #t class="input" type="time" value="10:00" /></label>
          <label>Site<select #s class="input"><option>Head Office</option><option>Manufacturing</option><option>Warehouse</option><option>Data Center</option></select></label>
          <label>Scenario<select #ty class="input">@for (x of types; track x) {<option>{{ x }}</option>}</select></label>
          <label>Scope<select #sc class="input"><option>Full Building</option><option>Single Floor</option><option>Zone</option></select></label>
          <label>Notice<select #n class="input"><option>Announced</option><option>Unannounced</option></select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="open.set(false)">Cancel</button><button class="btn-primary" type="submit">Schedule</button></div>
      </form>
    }
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .dr { display: flex; gap: 12px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--kl-f0f1f6); } .dt { width: 46px; display: flex; flex-direction: column; align-items: center; padding: 4px; border-radius: 8px; background: var(--primary-soft); color: var(--primary); }
    .dt b { font-size: 17px; } .dt small { font-size: 11px; } .di { flex: 1; display: flex; flex-direction: column; font-size: 13px; } .di small { color: var(--muted); font-size: 11.5px; }
  `,
})
export class EventsDrills {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  private readonly store = inject(EmergencyStore);
  private readonly router = inject(Router);
  protected readonly types = INCIDENT_TYPES;
  protected readonly open = signal(false);
  protected readonly msg = signal<string | null>(null);
  protected readonly nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  protected readonly months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  protected readonly times = [
    { name: 'Evacuation time', color: 'var(--ka-7c3aed)', values: [11.2, 10.4, 9.8, 10.1, 9.2, 8.8, 9.4, 8.1, 6.1, 8.6, 7.9, 6.4] },
    { name: 'Target', color: 'var(--ka-ef4444)', values: Array(12).fill(10), line: true },
  ];
  protected readonly drills = signal<Drill[]>([
    { id: 'D1', date: this.iso(9), time: '10:00', site: 'Manufacturing', type: 'Fire Alarm', scope: 'Full Building', lead: 'Ravi Shankar', notice: 'Announced' },
    { id: 'D2', date: this.iso(23), time: '14:30', site: 'Head Office', type: 'Gas Leak', scope: 'Single Floor', lead: 'Tom Baker', notice: 'Unannounced' },
    { id: 'D3', date: this.iso(41), time: '09:00', site: 'Warehouse', type: 'Earthquake', scope: 'Full Building', lead: 'Aisha Bello', notice: 'Announced' },
  ]);
  protected readonly past = computed(() => this.store.history().map((h, i) => ({ ...h, acc: [99.2, 97.1, 100, 98.4, 96.8][i % 5] })));
  private iso(d: number) {
    return new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  }
  protected mon(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { month: 'short' });
  }
  protected date = fmtD;
  protected dur(h: Evacuation) {
    return h.endedAt ? fmtTimer(h.endedAt - h.triggeredAt) : 'running';
  }
  protected add(date: string, time: string, site: string, type: string, scope: string, notice: string) {
    this.drills.update((l) => [...l, { id: `D${Date.now() % 1e5}`, date, time, site, type, scope, lead: 'Demo login', notice }].sort((a, b) => a.date.localeCompare(b.date)));
    this.open.set(false);
    toast(this.msg, `${type} drill scheduled for ${fmtD(date)} · wardens notified`);
  }
  protected cancel(id: string) {
    this.drills.update((l) => l.filter((d) => d.id !== id));
  }
  protected startNow() {
    this.store.drillMode.set(true);
    this.router.navigate(['/emergency-mustering/emergency-command-center']);
  }
}

/* ======================= Notifications ======================= */
@Component({
  selector: 'app-emergency-notifications',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Notifications" [parent]="parent" [parentLink]="link" subtitle="Mass notification — SMS, push, email, PA and signage." />
    <section class="dash">
      <form class="card span-5 comp" (submit)="$event.preventDefault(); send(tp.value, txt.value, a.value)">
        <div class="card-head"><h3>Compose</h3></div>
        <label>Template<select #tp class="input" (change)="txt.value = tpl[$any($event.target).value]">@for (k of keys; track k) {<option>{{ k }}</option>}</select></label>
        <label>Audience<select #a class="input"><option>Everyone on site</option><option>Yet to evacuate &amp; missing</option><option>Wardens &amp; responders</option></select></label>
        <label>Message<textarea #txt class="input" rows="4">{{ tpl['Evacuate now'] }}</textarea></label>
        <div class="chs">@for (c of channels; track c) {<label><input type="checkbox" [checked]="picked().includes(c)" (change)="flip(c)" />{{ c }}</label>}</div>
        <button class="btn-primary" type="submit" [disabled]="!picked().length"><app-icon name="megaphone" [size]="16" />Send Now</button>
      </form>
      <div class="card span-3">
        <div class="card-head"><h3>Delivery (last broadcast)</h3></div>
        <app-donut [segments]="delivery" center="Recipients" [size]="130" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Channels</h3></div>
        @for (c of chStats; track c.name) {<div class="ch"><span>{{ c.name }}</span><b>{{ c.rate }}%</b><small>{{ c.time }}</small></div>}
      </div>
      <div class="card span-12">
        <div class="card-head"><h3>Sent Messages</h3></div>
        <table class="table">
          <thead><tr><th>Time</th><th>Title</th><th>Message</th><th>Audience</th><th>Channels</th><th>Delivered</th></tr></thead>
          <tbody>@for (m of log(); track $index) {<tr><td>{{ clock(m.at) }}</td><td><b>{{ m.title }}</b></td><td class="txt">{{ m.text }}</td><td>{{ m.audience }}</td><td>{{ m.channels.join(', ') }}</td><td>{{ m.delivered }}</td></tr>}</tbody>
        </table>
      </div>
    </section>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .comp { display: flex; flex-direction: column; gap: 10px; } .comp > label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); } textarea.input { height: auto; padding: 8px 10px; font: inherit; }
    .chs { display: flex; flex-wrap: wrap; gap: 12px; font-size: 13px; } .chs label { display: flex; gap: 5px; align-items: center; } .chs input { accent-color: var(--primary); } .comp > button { align-self: flex-start; }
    .ch { display: grid; grid-template-columns: 1fr 60px 80px; padding: 9px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 13px; } .ch small { color: var(--muted); text-align: right; }
    .txt { max-width: 380px; white-space: normal; color: var(--kf-4b5068); }
  `,
})
export class EmergencyNotifications {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  private readonly store = inject(EmergencyStore);
  protected readonly tpl = TEMPLATES;
  protected readonly keys = Object.keys(TEMPLATES);
  protected readonly channels = ['SMS', 'Push', 'Email', 'PA System', 'Desktop Pop-up', 'Digital Signage'];
  protected readonly picked = signal(['SMS', 'Push', 'PA System']);
  protected readonly msg = signal<string | null>(null);
  protected readonly delivery = [
    { label: 'Read', value: 761, color: 'var(--ka-22c55e)' },
    { label: 'Delivered', value: 64, color: 'var(--ka-3b82f6)' },
    { label: 'Pending', value: 11, color: 'var(--ka-f59e0b)' },
    { label: 'Failed', value: 6, color: 'var(--ka-ef4444)' },
  ];
  protected readonly chStats = [
    { name: 'Push', rate: 98.9, time: '2 s avg' }, { name: 'SMS', rate: 99.4, time: '6 s avg' }, { name: 'PA System', rate: 100, time: 'instant' },
    { name: 'Email', rate: 97.2, time: '18 s avg' }, { name: 'Desktop Pop-up', rate: 91.0, time: '3 s avg' }, { name: 'Digital Signage', rate: 100, time: 'instant' },
  ];
  private readonly seed = (() => {
    const t = this.store.evac()?.triggeredAt ?? Date.now();
    return [{ at: t + 102000, title: 'Evacuate now', text: TEMPLATES['Evacuate now'], channels: ['SMS', 'Push', 'PA System', 'Digital Signage'], audience: 'Everyone on site', delivered: 842 }];
  })();
  protected readonly log = computed(() => [...this.store.sent(), ...this.seed]);
  protected flip(c: string) {
    this.picked.update((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));
  }
  protected clock = fmtClock;
  protected send(title: string, text: string, audience: string) {
    this.store.broadcast(title, text, this.picked(), audience);
    toast(this.msg, `“${title}” sent to ${audience.toLowerCase()}`);
  }
}

/* ======================= Incidents & Reports ======================= */
@Component({
  selector: 'app-emergency-reports',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Incidents &amp; Reports" [parent]="parent" [parentLink]="link" subtitle="After-action reports for every evacuation and drill." />
    <section class="ir">
      <div class="card">
        <div class="card-head"><h3>Incidents</h3></div>
        @for (h of all(); track h.id) {
          <div class="it" [class.on]="h.id === sel()?.id" (click)="selId.set(h.id)"><b>{{ h.id }}</b><span>{{ h.type }}{{ h.drill ? ' (Drill)' : '' }}</span><small>{{ date(h.triggeredAt) }} · {{ h.endedAt ? 'Closed' : 'Active' }}</small></div>
        }
      </div>
      @if (sel(); as h) {
        <div class="card rep">
          <div class="card-head"><h3>After-Action Report · {{ h.id }}</h3><button class="btn-outline" (click)="exportCsv(h)"><app-icon name="download" [size]="15" />Export</button></div>
          <dl class="kv"><dt>Type</dt><dd>{{ h.type }}</dd><dt>Location</dt><dd>{{ h.location }}</dd><dt>Scope</dt><dd>{{ h.scope }}</dd><dt>Triggered</dt><dd>{{ date(h.triggeredAt) }} {{ clock(h.triggeredAt) }} by {{ h.by }}</dd><dt>Duration</dt><dd>{{ h.endedAt ? timer(h.endedAt - h.triggeredAt) : 'In progress' }}</dd></dl>
          <section class="kpi-row">
            <app-kpi label="People Involved" [value]="m(h).people" icon="users" color="var(--ka-3b82f6)" />
            <app-kpi label="Accounted @ 10 min" [value]="m(h).acc + '%'" icon="user-check" color="var(--ka-22c55e)" />
            <app-kpi label="Missing (final)" [value]="m(h).missing" icon="triangle-alert" color="var(--ka-ef4444)" />
            <app-kpi label="Injuries" [value]="m(h).injuries" icon="shield-plus" color="var(--ka-f59e0b)" />
          </section>
          <h4>Findings &amp; actions</h4>
          <ul class="fd">@for (f of m(h).findings; track $index) {<li>{{ f }}</li>}</ul>
          <label class="ll">Lessons learned<textarea class="input" rows="3" [value]="notes()[h.id] ?? ''" (input)="note(h.id, $any($event.target).value)" placeholder="Add notes for the HSE committee…"></textarea></label>
        </div>
      }
    </section>
  `,
  styles: `
    .ir { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 14px; align-items: start; }
    .it { display: flex; flex-direction: column; gap: 2px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; cursor: pointer; font-size: 13px; } .it.on { border-color: var(--primary); background: var(--kb-faf8ff); } .it small { color: var(--muted); }
    .rep { display: flex; flex-direction: column; gap: 12px; } .kv { display: grid; grid-template-columns: 100px 1fr; gap: 6px; font-size: 13px; margin: 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; }
    h4 { margin: 0; font-size: 14px; } .fd { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.7; } .ll { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); } textarea.input { height: auto; padding: 8px; font: inherit; }
    @media (max-width: 1100px) { .ir { grid-template-columns: 1fr; } }
  `,
})
export class EmergencyReports {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  private readonly store = inject(EmergencyStore);
  protected readonly notes = signal<Record<string, string>>({});
  protected readonly all = computed(() => [...(this.store.evac() && !this.store.evac()!.endedAt ? [this.store.evac()!] : []), ...this.store.history()]);
  protected readonly selId = signal<string | null>(null);
  protected readonly sel = computed(() => this.all().find((h) => h.id === this.selId()) ?? this.all()[0] ?? null);
  protected date = fmtD;
  protected clock = fmtClock;
  protected timer = fmtTimer;
  protected m(h: Evacuation) {
    if (!h.endedAt) {
      const c = this.store.counts();
      return { people: c.total, acc: ((c.evac / c.total) * 100).toFixed(1), missing: c.missing, injuries: 0, findings: ['Evacuation still in progress — report will finalise on all clear.', `${c.missing} people unaccounted for; search teams dispatched.`, 'Conference Room fire panel zone 1-04 in alarm.'] };
    }
    const r = rng([...h.id].reduce((a, ch) => a + ch.charCodeAt(0), 0));
    return {
      people: 400 + Math.floor(r() * 500), acc: (96 + r() * 4).toFixed(1), missing: 0, injuries: h.drill ? 0 : Math.floor(r() * 2),
      findings: ['North stairwell congested for ~90 s — add second warden at landing.', 'Two visitors had no host escort; host-notification rule updated.', 'Muster Point E badge reader offline for 4 min; spare reader assigned.'].slice(0, 2 + Math.floor(r() * 2)),
    };
  }
  protected note(id: string, v: string) {
    this.notes.update((n) => ({ ...n, [id]: v }));
  }
  protected exportCsv(h: Evacuation) {
    const m = this.m(h);
    downloadCsv(`after-action-${h.id}.csv`, [['Field', 'Value'], ['ID', h.id], ['Type', h.type], ['Location', h.location], ['Scope', h.scope], ['People', m.people], ['Accounted %', m.acc], ['Missing', m.missing], ['Injuries', m.injuries], ...m.findings.map((f, i) => [`Finding ${i + 1}`, f]), ['Lessons learned', this.notes()[h.id] ?? '']]);
  }
}

/* ======================= Emergency Devices ======================= */
interface EDevice {
  id: string;
  type: string;
  location: string;
  floor: string;
  status: string;
  lastTest: string;
  nextInspection: string;
  battery: number;
}
const DEV_TYPES = ['Fire Alarm Panel', 'Manual Call Point', 'Smoke Detector', 'Siren / Strobe', 'PA Speaker', 'Emergency Light', 'AED', 'Fire Extinguisher', 'Muster Badge Reader'];

@Component({
  selector: 'app-emergency-devices',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Emergency Devices" [parent]="parent" [parentLink]="link" subtitle="Fire panels, detectors, sirens, PA, emergency lighting, AEDs and muster readers." />
    <section class="kpi-row">
      <app-kpi label="Devices" [value]="list().length" icon="cpu" color="var(--ka-7c3aed)" />
      <app-kpi label="In Alarm" [value]="cnt('Alarm')" icon="flame" color="var(--ka-ef4444)" />
      <app-kpi label="Faults" [value]="cnt('Fault')" icon="triangle-alert" color="var(--ka-f59e0b)" />
      <app-kpi label="Inspections Due (30 d)" [value]="due()" icon="calendar-days" color="var(--ka-3b82f6)" />
    </section>
    <div class="card">
      <app-data-table [rows]="list()" [columns]="cols" [filters]="filters" [actions]="actions" noun="devices" [pageSize]="12" [searchKeys]="['id', 'location', 'type']" (action)="act($event.action, $event.row)" />
    </div>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
})
export class EmergencyDevices {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  protected readonly msg = signal<string | null>(null);
  protected readonly list = signal<EDevice[]>(
    (() => {
      const r = rng(112);
      const floors = ['Ground Floor', 'Floor 1', 'Floor 2', 'Floor 3', 'Floor 4', 'Floor 5'];
      const locs = ['Lobby', 'Conference Room', 'West Wing', 'North Wing', 'Cafeteria', 'Stairwell A', 'Stairwell B', 'Plant Room', 'Corridor'];
      const out: EDevice[] = [];
      DEV_TYPES.forEach((t, ti) => {
        const n = [2, 24, 60, 18, 30, 40, 6, 36, 6][ti];
        for (let i = 0; i < n; i++) {
          const f = floors[i % 6];
          const loc = t === 'Muster Badge Reader' ? `Muster Point ${'ABCDEF'[i]}` : locs[(i * 3 + ti) % locs.length];
          const alarm = (t === 'Smoke Detector' && i === 7) || (t === 'Manual Call Point' && i === 1) || t === 'Fire Alarm Panel' && i === 0;
          const fault = !alarm && r() < 0.04;
          out.push({ id: `${t.split(' ').map((w) => w[0]).join('').toUpperCase()}-${String(i + 1).padStart(3, '0')}`, type: t, location: t === 'Muster Badge Reader' ? loc : `${f} · ${alarm && t !== 'Fire Alarm Panel' ? 'Conference Room' : loc}`, floor: t === 'Muster Badge Reader' ? 'Outdoor' : alarm ? 'Floor 1' : f,
            status: alarm ? 'Alarm' : fault ? 'Fault' : 'Normal', lastTest: new Date(Date.now() - Math.floor(r() * 170) * 86400000).toISOString().slice(0, 10), nextInspection: new Date(Date.now() + Math.floor(r() * 200 - 10) * 86400000).toISOString().slice(0, 10), battery: Math.round(60 + r() * 40) });
        }
      });
      return out;
    })(),
  );
  protected readonly cols: Col[] = [
    { key: 'id', label: 'Device' },
    { key: 'type', label: 'Type' },
    { key: 'location', label: 'Location' },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => (r.status === 'Alarm' ? 'tag red' : r.status === 'Fault' ? 'tag amber' : r.status === 'Silenced' ? 'tag blue' : 'tag green') },
    { key: 'battery', label: 'Battery', kind: 'progress' },
    { key: 'lastTest', label: 'Last test', fmt: fmtD },
    { key: 'nextInspection', label: 'Next inspection', fmt: fmtD },
  ];
  protected readonly filters = [{ key: 'type', label: 'Type', options: DEV_TYPES }, { key: 'status', label: 'Status', options: ['Normal', 'Alarm', 'Fault', 'Silenced'] }, { key: 'floor', label: 'Floor', options: ['Ground Floor', 'Floor 1', 'Floor 2', 'Floor 3', 'Floor 4', 'Floor 5', 'Outdoor'] }];
  protected readonly actions: RowAction[] = [
    { id: 'test', label: 'Run test', icon: 'activity' },
    { id: 'silence', label: 'Silence', icon: 'bell', when: (r) => r.status === 'Alarm' },
    { id: 'reset', label: 'Reset', icon: 'refresh', when: (r) => r.status !== 'Normal' },
    { id: 'inspect', label: 'Mark inspected', icon: 'file-check' },
  ];
  protected readonly due = computed(() => this.list().filter((d) => new Date(d.nextInspection).getTime() - Date.now() < 30 * 86400000).length);
  protected cnt(s: string) {
    return this.list().filter((d) => d.status === s).length;
  }
  protected act(a: string, d: EDevice) {
    const today = new Date().toISOString().slice(0, 10);
    const c: Partial<EDevice> = a === 'test' ? { lastTest: today } : a === 'silence' ? { status: 'Silenced' } : a === 'reset' ? { status: 'Normal' } : { nextInspection: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10), lastTest: today };
    this.list.update((l) => l.map((x) => (x.id === d.id ? { ...x, ...c } : x)));
    toast(this.msg, a === 'test' ? `${d.id} test passed` : `${d.id} updated`);
  }
}

/* ======================= Configuration & Masters ======================= */
@Component({
  selector: 'app-emergency-config',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Configuration &amp; Masters" [parent]="parent" [parentLink]="link" subtitle="Incident types, escalation timers, muster rules and message templates.">
      <button class="btn-primary" (click)="save()"><app-icon name="file-check" [size]="16" />Save Changes</button>
    </app-page-head>
    <div class="tabs-row">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>}</div>
    <div class="card">
      @switch (tab()) {
        @case ('Incident Types') {
          <table class="table">
            <thead><tr><th>Incident type</th><th>Severity</th><th>Default scope</th><th>Auto-trigger source</th><th>Siren</th></tr></thead>
            <tbody>
              @for (t of types(); track t.name; let i = $index) {
                <tr><td><b>{{ t.name }}</b></td>
                  <td><select class="input sm" [value]="t.sev" (change)="patch(i, 'sev', $any($event.target).value)"><option>Critical</option><option>High</option><option>Medium</option></select></td>
                  <td><select class="input sm" [value]="t.scope" (change)="patch(i, 'scope', $any($event.target).value)"><option>Full Building Evacuation</option><option>Floor Evacuation</option><option>Zone Evacuation</option><option>Shelter in Place</option></select></td>
                  <td>{{ t.source }}</td><td><input type="checkbox" [checked]="t.siren" (change)="patch(i, 'siren', $any($event.target).checked)" /></td></tr>
              }
            </tbody>
          </table>
        }
        @case ('Escalation') {
          <div class="esc">
            @for (e of esc(); track e.label; let i = $index) {
              <label><span>{{ e.label }}</span><input class="input sm" type="number" [value]="e.value" (input)="setEsc(i, +$any($event.target).value)" /><small>{{ e.unit }}</small></label>
            }
          </div>
        }
        @case ('Muster Rules') {
          <table class="table">
            <thead><tr><th>Group</th><th>Primary muster</th><th>Fallback</th></tr></thead>
            <tbody>
              @for (r of rules(); track r.group; let i = $index) {
                <tr><td><b>{{ r.group }}</b></td>
                  <td><select class="input sm" [value]="r.primary" (change)="setRule(i, 'primary', $any($event.target).value)">@for (m of musters; track m) {<option [value]="m">Muster Point {{ m }}</option>}</select></td>
                  <td><select class="input sm" [value]="r.fallback" (change)="setRule(i, 'fallback', $any($event.target).value)">@for (m of musters; track m) {<option [value]="m">Muster Point {{ m }}</option>}</select></td></tr>
              }
            </tbody>
          </table>
        }
        @case ('Templates') {
          @for (k of tplKeys; track k) {
            <label class="tp"><b>{{ k }}</b><textarea class="input" rows="2" [value]="tpl()[k]" (input)="setTpl(k, $any($event.target).value)"></textarea></label>
          }
        }
      }
    </div>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .tabs-row { display: flex; gap: 6px; margin-bottom: 12px; } .tabs-row button { padding: 8px 18px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); cursor: pointer; font: inherit; } .tabs-row button.on { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); }
    .input.sm { height: 32px; width: auto; } .esc { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 30px; } .esc label { display: grid; grid-template-columns: 1fr 100px 60px; gap: 10px; align-items: center; font-size: 13px; } .esc small { color: var(--muted); }
    .tp { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 13px; } textarea.input { height: auto; padding: 8px; font: inherit; }
  `,
})
export class EmergencyConfig {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  protected readonly tabs = ['Incident Types', 'Escalation', 'Muster Rules', 'Templates'];
  protected readonly tab = signal('Incident Types');
  protected readonly msg = signal<string | null>(null);
  protected readonly musters = ['A', 'B', 'C', 'D', 'E', 'F'];
  protected readonly types = signal(INCIDENT_TYPES.map((name, i) => ({ name, sev: i < 4 || i === 7 ? 'Critical' : i < 6 ? 'High' : 'Medium', scope: i === 5 || i === 7 ? 'Shelter in Place' : i === 6 ? 'Zone Evacuation' : 'Full Building Evacuation', source: ['Fire panel', 'Gas detectors', 'Security control', 'Seismic sensor', 'Chemical sensor', 'Weather feed', 'Manual', 'Security control'][i], siren: i < 5 })));
  protected readonly esc = signal([
    { label: 'Escalate missing person to search team after', value: 5, unit: 'min' },
    { label: 'Notify Civil Defence if missing after', value: 10, unit: 'min' },
    { label: 'Re-send evacuation SMS every', value: 2, unit: 'min' },
    { label: 'Muster check-in grace period', value: 8, unit: 'min' },
    { label: 'Auto-close drill after', value: 30, unit: 'min' },
    { label: 'Warden acknowledgement timeout', value: 60, unit: 'sec' },
  ]);
  protected readonly rules = signal([
    { group: 'Administration', primary: 'A', fallback: 'C' }, { group: 'IT', primary: 'B', fallback: 'A' }, { group: 'Finance', primary: 'A', fallback: 'F' },
    { group: 'Operations', primary: 'D', fallback: 'B' }, { group: 'HR', primary: 'C', fallback: 'A' }, { group: 'Facilities', primary: 'E', fallback: 'D' }, { group: 'Visitors & Contractors', primary: 'F', fallback: 'A' },
  ]);
  protected readonly tpl = signal<Record<string, string>>({ ...TEMPLATES });
  protected readonly tplKeys = Object.keys(TEMPLATES);
  protected patch(i: number, k: string, v: unknown) {
    this.types.update((l) => l.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  }
  protected setEsc(i: number, v: number) {
    this.esc.update((l) => l.map((e, j) => (j === i ? { ...e, value: v } : e)));
  }
  protected setRule(i: number, k: 'primary' | 'fallback', v: string) {
    this.rules.update((l) => l.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  }
  protected setTpl(k: string, v: string) {
    this.tpl.update((t) => ({ ...t, [k]: v }));
    TEMPLATES[k] = v;
  }
  protected save() {
    toast(this.msg, 'Emergency configuration saved');
  }
}
