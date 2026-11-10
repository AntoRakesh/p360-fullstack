import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { RECORDS } from '../attendance/attendance.data';
import { Brk, Shift, SHIFTS, TEMPLATES } from './shifts.data';

const TABS = ['Overview', 'Schedule & Breaks', 'Rules & Policies', 'Assigned To', 'Audit Log'] as const;
const ICONS = ['clock', 'activity', 'coffee', 'star', 'shield', 'briefcase', 'building', 'home'];
const TYPES = ['General', 'Rotational', 'On Call', 'Remote', 'Part Time', 'Flexible'];
const PATTERNS = ['Fixed', 'Split', 'Rotation', 'Flexible'];
const SITE_OPTS = ['All Sites', 'Head Office', 'Manufacturing', 'Warehouse', 'Retail Stores', 'Data Center', 'Tech Center'];
const toM = (t: string) => (t ? +t.split(':')[0] * 60 + +t.split(':')[1] : 0);
const hrsBetween = (a: string, b: string) => {
  if (!a || !b) return 0;
  let d = toM(b) - toM(a);
  if (d <= 0) d += 1440;
  return d / 60;
};
const ampm = (t: string) => {
  if (!t) return '-';
  const [h, m] = t.split(':').map(Number);
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

interface Audit {
  when: string;
  who: string;
  what: string;
}
interface Rules {
  otAfter: number;
  minRest: number;
  maxDays: number;
  swaps: boolean;
  nightPct: number;
  autoOut: string;
  policy: string;
}

@Component({
  selector: 'app-shift-master',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Shift Master" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="Create and manage shift definitions used for roster planning and employee assignments.">
      <div class="split menu-wrap">
        <button class="btn-primary" (click)="openForm()"><app-icon name="plus" [size]="16" />Add Shift</button>
        <button class="btn-primary caret" (click)="addMenu.set(!addMenu())" aria-label="More add options"><app-icon name="chevron-down" [size]="15" /></button>
        @if (addMenu()) {
          <div class="dropdown">
            <button class="dd-item" (click)="openForm()">Blank shift</button>
            @if (sel()) {<button class="dd-item" (click)="duplicate(sel()!)">Duplicate “{{ sel()!.name }}”</button>}
            <button class="dd-item" (click)="importSample()">Load 3 sample shifts</button>
          </div>
        }
      </div>
      <label class="btn-ghost"><app-icon name="download" [size]="16" class="up" />Import<input type="file" accept=".csv" hidden (change)="importFile($event)" /></label>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
      <div class="menu-wrap">
        <button class="btn-ghost" (click)="more.set(!more())" aria-label="More">⋮</button>
        @if (more()) {
          <div class="dropdown">
            <button class="dd-item" (click)="print()"><app-icon name="file-text" [size]="15" />Print</button>
            <button class="dd-item" (click)="reset()"><app-icon name="refresh" [size]="15" />Reset demo data</button>
          </div>
        }
      </div>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Shifts" [value]="shifts().length" icon="users" color="var(--ka-8b5cf6)" sub="Active shift definitions" />
      <app-kpi label="Active Shifts" [value]="activeCount()" icon="clock" color="var(--ka-22c55e)" sub="In use across sites" />
      <app-kpi label="Shift Templates" [value]="templates" icon="calendar-days" color="var(--ka-f97316)" sub="Rotation templates" />
      <app-kpi label="Assigned Employees" value="8,920" icon="users" color="var(--ka-3b82f6)" sub="Across all shifts" />
      <app-kpi label="Coverage" value="98.5%" icon="clock" color="var(--ka-a855f7)" sub="Current period" />
    </section>

    <section class="sm" [class.with-detail]="!!sel()">
      <div class="card">
        @if (view() === 'list') {
          <app-data-table
            [rows]="shifts()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk"
            [searchKeys]="['name', 'code', 'description']" searchPlaceholder="Search by shift name, code, or description..." [pageSize]="12" [activeId]="selKey()"
            idKey="code" noun="shifts" (rowClick)="selCode.set($event.code)" (action)="onAction($event.action, $event.row)" (bulk)="onBulk($event.action, $event.ids)"
          >
            <div class="vt">
              <button [class.on]="view() === 'list'" (click)="view.set('list')" title="List"><app-icon name="list-checks" [size]="16" /></button>
              <button [class.on]="view() === 'grid'" (click)="view.set('grid')" title="Cards"><app-icon name="grid" [size]="16" [stroke]="2.4" /></button>
            </div>
          </app-data-table>
        } @else {
          <div class="card-head">
            <h3>{{ shifts().length }} shifts</h3>
            <div class="vt">
              <button (click)="view.set('list')" title="List"><app-icon name="list-checks" [size]="16" /></button>
              <button class="on" title="Cards"><app-icon name="grid" [size]="16" [stroke]="2.4" /></button>
            </div>
          </div>
          <div class="cards">
            @for (s of shifts(); track s.code) {
              <button class="scard" [class.on]="selCode() === s.code" [style.border-top-color]="s.color" (click)="selCode.set(s.code)">
                <div class="sc-top"><span class="badge" [style.background]="s.color">{{ s.name[0] }}</span><div><b>{{ s.name }}</b><small>{{ s.code }} · {{ s.type }}</small></div></div>
                <div class="sc-time">{{ timeLabel(s) }}</div>
                <div class="sc-foot"><span>{{ s.hours }}h · {{ s.assigned.toLocaleString() }} people</span><span [class]="statusTag(s.status)">{{ s.status }}</span></div>
              </button>
            }
          </div>
        }
      </div>

      @if (sel(); as s) {
        <aside class="card detail">
          <div class="d-head">
            <h2>{{ s.name }}</h2>
            <span class="pill" [class.inactive]="s.status !== 'Active'"><i></i>{{ s.status }}</span>
            <button class="close-btn" (click)="selCode.set(null)">×</button>
          </div>
          <nav class="d-tabs">
            @for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>}
          </nav>

          @switch (tab()) {
            @case ('Overview') {
              <div class="ov card-in">
                <div class="ov-top">
                  <span class="big-badge" [style.background]="s.color">{{ s.name[0] }}</span>
                  <div><b>{{ s.name }}</b><span>{{ s.code }}</span></div>
                  <button class="btn-ghost sm" (click)="openForm(s)">Edit</button>
                </div>
                <p class="desc"><span>Description</span>{{ s.description }}</p>
                <div class="facts">
                  <dl>
                    <dt><app-icon name="sliders" [size]="13" />Shift Type</dt><dd>{{ s.type }}</dd>
                    <dt><app-icon name="workflow" [size]="13" />Work Pattern</dt><dd>{{ s.pattern }}</dd>
                    <dt><app-icon name="clock" [size]="13" />Start Time</dt><dd>{{ ampm(s.start) }}</dd>
                    <dt><app-icon name="calendar-days" [size]="13" />End Time</dt><dd>{{ ampm(s.end2 ?? s.end) }}</dd>
                    <dt><app-icon name="clock" [size]="13" />Total Hours</dt><dd>{{ hm(s.hours) }}</dd>
                    <dt><app-icon name="clock" [size]="13" />Grace Time</dt><dd>{{ s.grace }} minutes</dd>
                  </dl>
                  <dl>
                    <dt><i class="g"></i>Status</dt><dd>{{ s.status }}</dd>
                    <dt><i class="g"></i>Applicable Sites</dt><dd>{{ s.sites }}</dd>
                    <dt><i class="g"></i>Applicable Departments</dt><dd>{{ s.depts }}</dd>
                    <dt><app-icon name="building" [size]="13" />Employment Types</dt><dd>{{ s.empTypes }}</dd>
                    <dt><app-icon name="calendar-days" [size]="13" />Effective From</dt><dd>{{ dmy(s.from) }}</dd>
                    <dt><app-icon name="calendar-days" [size]="13" />Effective To</dt><dd>{{ s.to ? dmy(s.to) : '-' }}</dd>
                  </dl>
                </div>
              </div>
              <div class="card-in">
                <div class="bh"><h4>Break Schedule</h4><button class="link" (click)="startBreak()">+ Add Break</button></div>
                <table class="table brk">
                  <thead><tr><th>Break Name</th><th>Start Time</th><th>End Time</th><th>Duration</th><th>Type</th><th>Actions</th></tr></thead>
                  <tbody>
                    @for (b of s.breaks; track $index; let i = $index) {
                      @if (editBreak() === i) {
                        <tr class="edit-row">
                          <td><input #bn class="input" [value]="b.name" /></td>
                          <td><input #bs class="input" type="time" [value]="b.start" /></td>
                          <td><input #be class="input" type="time" [value]="b.end" /></td>
                          <td>—</td>
                          <td><select #bp class="select"><option [selected]="b.paid" value="1">Paid</option><option [selected]="!b.paid" value="0">Unpaid</option></select></td>
                          <td><button class="link" (click)="saveBreak(i, bn.value, bs.value, be.value, bp.value === '1')">Save</button></td>
                        </tr>
                      } @else {
                        <tr>
                          <td>{{ b.name }}</td><td>{{ ampm(b.start) }}</td><td>{{ ampm(b.end) }}</td><td>{{ dur(b) }} mins</td>
                          <td><span [class]="b.paid ? 'paid' : 'tag amber'">{{ b.paid ? 'Paid' : 'Unpaid' }}</span></td>
                          <td class="acts">
                            <button (click)="editBreak.set(i)" title="Edit"><app-icon name="sliders" [size]="14" /></button>
                            <button class="del" (click)="removeBreak(i)" title="Delete"><app-icon name="ban" [size]="14" /></button>
                          </td>
                        </tr>
                      }
                    } @empty {
                      <tr><td colspan="6" class="empty-note">No breaks defined</td></tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="look">
                <label>Shift Color
                  <span class="color-in"><input type="color" [value]="(s.color.startsWith('#') ? s.color : '#' + s.color.slice(-7, -1))" (input)="patch({ color: $any($event.target).value })" /><b>{{ (s.color.startsWith('#') ? s.color : '#' + s.color.slice(-7, -1)).toUpperCase() }}</b></span>
                </label>
                <label>Shift Icon
                  <span class="icon-in"><app-icon [name]="s.icon" [size]="20" />
                    <select class="select" [value]="s.icon" (change)="patch({ icon: $any($event.target).value })">@for (i of icons; track i) {<option [value]="i">{{ i }}</option>}</select>
                  </span>
                </label>
              </div>
            }
            @case ('Schedule & Breaks') {
              <p class="muted">24-hour view of working time and breaks.</p>
              <div class="tl">
                @for (seg of segments(); track $index) {
                  <span class="seg" [class.brk-seg]="seg.brk" [style.left.%]="seg.l" [style.width.%]="seg.w" [style.background]="seg.brk ? null : s.color" [title]="seg.label"></span>
                }
              </div>
              <div class="tl-axis">@for (h of [0, 3, 6, 9, 12, 15, 18, 21, 24]; track h) {<span>{{ h }}:00</span>}</div>
              <dl class="kv">
                <dt>Working time</dt><dd>{{ hm(s.hours) }}</dd>
                <dt>Paid breaks</dt><dd>{{ breakMins(s, true) }} min</dd>
                <dt>Unpaid breaks</dt><dd>{{ breakMins(s, false) }} min</dd>
                <dt>Net paid hours</dt><dd>{{ hm(s.hours - breakMins(s, false) / 60) }}</dd>
              </dl>
            }
            @case ('Rules & Policies') {
              <div class="form-grid">
                <label>Overtime after (h)<input class="input" type="number" [value]="rules().otAfter" (change)="setRule('otAfter', +$any($event.target).value)" /></label>
                <label>Min. rest between shifts (h)<input class="input" type="number" [value]="rules().minRest" (change)="setRule('minRest', +$any($event.target).value)" /></label>
                <label>Max consecutive days<input class="input" type="number" [value]="rules().maxDays" (change)="setRule('maxDays', +$any($event.target).value)" /></label>
                <label>Night allowance (%)<input class="input" type="number" [value]="rules().nightPct" (change)="setRule('nightPct', +$any($event.target).value)" /></label>
                <label>Auto clock-out at<input class="input" type="time" [value]="rules().autoOut" (change)="setRule('autoOut', $any($event.target).value)" /></label>
                <label>Attendance policy
                  <select class="select" [value]="rules().policy" (change)="setRule('policy', $any($event.target).value)">
                    <option>General Office</option><option>Shift Workers</option><option>Field &amp; Sales Staff</option><option>Part-time</option><option>Contractors</option>
                  </select>
                </label>
                <label class="full chk"><input type="checkbox" [checked]="rules().swaps" (change)="setRule('swaps', !rules().swaps)" /> Allow employees to swap this shift</label>
              </div>
              <div class="form-actions"><button class="btn-primary" (click)="log('Rules updated'); notify('Rules saved')">Save rules</button></div>
            }
            @case ('Assigned To') {
              <p><b>{{ s.assigned.toLocaleString() }}</b> employees assigned</p>
              <app-bar-list [rows]="assignedBySite()" [max]="s.assigned || 1" />
              <h4>Sample members</h4>
              <ul class="members">
                @for (m of members(); track m.id) {
                  <li><span class="dt-av" [style.background]="m.avatar">{{ m.initials }}</span><div><b>{{ m.name }}</b><small>{{ m.id }} · {{ m.dept }} · {{ m.site }}</small></div></li>
                } @empty {
                  <li class="empty-note">No one assigned yet</li>
                }
              </ul>
            }
            @case ('Audit Log') {
              <ol class="audit">
                @for (a of audit()[s.code] ?? []; track $index) {
                  <li><b>{{ a.what }}</b><small>{{ a.who }} · {{ a.when }}</small></li>
                }
              </ol>
            }
          }
        </aside>
      }
    </section>

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>{{ editing() ? 'Edit ' + editing() : 'Add Shift' }}</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label>Shift name *<input class="input" required [value]="f.name" (input)="setF('name', $any($event.target).value)" /></label>
          <label>Shift code *<input class="input" required [value]="f.code" (input)="setF('code', $any($event.target).value.toUpperCase())" /></label>
          <label>Type<select class="select" [value]="f.type" (change)="setF('type', $any($event.target).value)">@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Work pattern<select class="select" [value]="f.pattern" (change)="setF('pattern', $any($event.target).value)">@for (t of patterns; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Start time<input class="input" type="time" [value]="f.start" (change)="setF('start', $any($event.target).value)" /></label>
          <label>End time<input class="input" type="time" [value]="f.end" (change)="setF('end', $any($event.target).value)" /></label>
          @if (f.pattern === 'Split') {
            <label>Second start<input class="input" type="time" [value]="f.start2 ?? ''" (change)="setF('start2', $any($event.target).value)" /></label>
            <label>Second end<input class="input" type="time" [value]="f.end2 ?? ''" (change)="setF('end2', $any($event.target).value)" /></label>
          }
          <label>Grace (min)<input class="input" type="number" [value]="f.grace" (change)="setF('grace', +$any($event.target).value)" /></label>
          <label>Status<select class="select" [value]="f.status" (change)="setF('status', $any($event.target).value)"><option>Active</option><option>Inactive</option><option>Draft</option></select></label>
          <label>Applicable sites<select class="select" [value]="f.sites" (change)="setF('sites', $any($event.target).value)">@for (x of siteOpts; track x) {<option [value]="x">{{ x }}</option>}</select></label>
          <label>Effective from<input class="input" type="date" [value]="f.from" (change)="setF('from', $any($event.target).value)" /></label>
          <label class="full">Description<input class="input" [value]="f.description" (input)="setF('description', $any($event.target).value)" /></label>
        </div>
        <p class="muted">Total hours: <b>{{ hm(formHours()) }}</b></p>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Save shift</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .split { display: flex; } .split .btn-primary:first-child { border-radius: 8px 0 0 8px; }
    .caret { border-radius: 0 8px 8px 0 !important; padding: 8px 9px !important; border-left: 1px solid rgba(255,255,255,.3) !important; }
    .up { transform: rotate(180deg); }
    .sm { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; }
    .sm.with-detail { grid-template-columns: minmax(0, 1.45fr) minmax(400px, 1fr); }
    .vt { display: flex; gap: 4px; }
    .vt button { width: 34px; height: 32px; border: 1px solid var(--border); border-radius: 7px; background: var(--kb-ffffff); display: grid; place-items: center; cursor: pointer; color: var(--kf-4b4f6b); }
    .vt button.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
    .scard { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border); border-top: 4px solid; border-radius: 10px; background: var(--kb-ffffff); text-align: left; cursor: pointer; }
    .scard.on { box-shadow: 0 0 0 2px var(--primary-soft); border-color: var(--primary); }
    .sc-top { display: flex; gap: 8px; align-items: center; } .sc-top div { display: flex; flex-direction: column; font-size: 12.5px; } .sc-top small { color: var(--muted); }
    .badge { width: 28px; height: 28px; border-radius: 7px; color: var(--kf-ffffff); display: grid; place-items: center; font-weight: 700; }
    .sc-time { font-size: 15px; font-weight: 600; } .sc-foot { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: var(--muted); }
    .detail { position: sticky; top: 76px; max-height: calc(100vh - 92px); overflow: auto; }
    .d-head { display: flex; align-items: center; gap: 10px; } .d-head h2 { margin: 0; font-size: 20px; } .d-head .close-btn { margin-left: auto; }
    .pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 10px; border-radius: 20px; background: var(--kb-dcfce7); color: var(--kf-15803d); font-size: 12px; }
    .pill i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; } .pill.inactive { background: var(--kb-f3f4f6); color: var(--kf-6b7280); }
    .d-tabs { display: flex; gap: 16px; border-bottom: 1px solid var(--border); margin: 12px 0; overflow-x: auto; }
    .d-tabs button { border: 0; background: none; padding: 8px 0; font-size: 12.5px; color: var(--kf-4b4f6b); border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; }
    .d-tabs button.on { color: var(--primary); border-color: var(--primary); font-weight: 600; }
    .card-in { border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 12px; }
    .ov-top { display: flex; align-items: center; gap: 12px; } .ov-top div { display: flex; flex-direction: column; flex: 1; } .ov-top span { font-size: 12.5px; color: var(--kf-4b4f6b); }
    .big-badge { width: 44px; height: 44px; border-radius: 10px; color: var(--kf-ffffff); display: grid; place-items: center; font-size: 20px; font-weight: 700; }
    .desc { display: flex; flex-direction: column; font-size: 12.5px; margin: 12px 0; } .desc span { color: var(--kf-4b4f6b); margin-bottom: 2px; }
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .facts dl { display: grid; grid-template-columns: auto 1fr; gap: 9px 10px; margin: 0; font-size: 11.5px; align-content: start; }
    .facts dt { display: flex; align-items: center; gap: 6px; color: var(--kf-3b3f5c); white-space: nowrap; } .facts dd { margin: 0; color: var(--kf-4b4f6b); }
    .facts .g { width: 9px; height: 9px; border-radius: 50%; background: var(--kb-22c55e); }
    .bh { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; } .bh h4 { margin: 0; font-size: 13.5px; }
    .brk { font-size: 11.5px; } .brk th, .brk td { padding: 7px 5px; } .brk .input, .brk .select { padding: 4px 6px; font-size: 11.5px; width: 100%; }
    .paid { color: var(--kf-3b3f5c); }
    .acts { display: flex; gap: 6px; } .acts button { border: 0; background: none; cursor: pointer; color: var(--kf-4b4f6b); } .acts .del { color: var(--red); }
    .look { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .look label { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; font-weight: 600; }
    .color-in, .icon-in { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; font-weight: 400; }
    .color-in input { width: 30px; height: 26px; border: 0; padding: 0; background: none; cursor: pointer; }
    .icon-in .select { border: 0; flex: 1; }
    .tl { position: relative; height: 34px; border-radius: 8px; background: var(--kb-f3f3f8); overflow: hidden; margin: 10px 0 4px; }
    .seg { position: absolute; top: 0; bottom: 0; border-radius: 4px; }
    .brk-seg { background: repeating-linear-gradient(45deg, var(--kb-fbbf24), var(--kb-fbbf24) 4px, var(--kb-fde68a) 4px, var(--kb-fde68a) 8px); top: 6px; bottom: 6px; }
    .tl-axis { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--muted); margin-bottom: 14px; }
    .kv { display: grid; grid-template-columns: 1fr auto; gap: 8px; font-size: 13px; } .kv dt { color: var(--muted); } .kv dd { margin: 0; font-weight: 600; }
    .chk { flex-direction: row !important; align-items: center; }
    .members { list-style: none; margin: 0; padding: 0; } .members li { display: flex; gap: 10px; align-items: center; padding: 6px 0; font-size: 12.5px; border-bottom: 1px solid var(--kl-f0f1f6); }
    .members div { display: flex; flex-direction: column; } .members small { color: var(--muted); }
    h4 { font-size: 13px; margin: 14px 0 6px; }
    .audit { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--kl-ede9fe); font-size: 12.5px; }
    .audit li { position: relative; display: flex; flex-direction: column; padding: 0 0 12px 8px; } .audit small { color: var(--muted); }
    .audit li::before { content: ''; position: absolute; left: -21px; top: 3px; width: 10px; height: 10px; border-radius: 50%; background: var(--primary); }
    @media (max-width: 1250px) { .sm.with-detail { grid-template-columns: 1fr; } .detail { position: static; max-height: none; } }
  `,
})
export class ShiftMaster {
  protected readonly tabs = TABS;
  protected readonly icons = ICONS;
  protected readonly types = TYPES;
  protected readonly patterns = PATTERNS;
  protected readonly siteOpts = SITE_OPTS;
  protected readonly templates = TEMPLATES.length;
  protected readonly ampm = ampm;
  protected readonly shifts = signal<Shift[]>(SHIFTS.map((s) => ({ ...s, breaks: s.breaks.map((b) => ({ ...b })) })));
  protected readonly selCode = signal<string | null>('DS-01');
  protected readonly tab = signal<(typeof TABS)[number]>('Overview');
  protected readonly view = signal<'list' | 'grid'>('list');
  protected readonly addMenu = signal(false);
  protected readonly more = signal(false);
  protected readonly editBreak = signal<number | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly rulesMap = signal<Record<string, Rules>>({});
  protected readonly audit = signal<Record<string, Audit[]>>(
    Object.fromEntries(
      SHIFTS.map((s) => [
        s.code,
        [
          { when: '12 Oct 2026, 02:15 PM', who: 'Rex Kumar', what: 'Break schedule updated' },
          { when: '01 Sep 2026, 09:40 AM', who: 'Priya Sharma', what: 'Grace time changed to ' + s.grace + ' min' },
          { when: '01 Jan 2026, 08:00 AM', who: 'System', what: 'Shift created' },
        ],
      ]),
    ),
  );

  protected readonly cols: Col[] = [
    { key: 'name', label: 'Shift Name', kind: 'swatch' },
    { key: 'code', label: 'Shift Code' },
    { key: 'type', label: 'Type' },
    { key: 'pattern', label: 'Work Pattern' },
    { key: 'start', label: 'Start Time', kind: 'lines', fmt: (v, r) => (r.start2 ? `${r.start} - ${r.end}\n${r.start2} - ${r.end2}` : v || '-') },
    { key: 'end', label: 'End Time', fmt: (v, r) => (r.start2 ? '' : v || '-') },
    { key: 'hours', label: 'Total Hours', fmt: (v) => (v ? `${Math.floor(v)}h ${Math.round((v % 1) * 60)}m` : '-') },
    { key: 'grace', label: 'Grace Time', fmt: (v, r) => (r.start ? `${v} mins` : '-') },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'site', label: 'Site', options: SITE_OPTS },
    { key: 'type', label: 'Shift Type', options: TYPES },
    { key: 'pattern', label: 'Work Pattern', options: PATTERNS },
    { key: 'status', label: 'Status', options: ['Active', 'Inactive', 'Draft'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View details', icon: 'file-text' },
    { id: 'edit', label: 'Edit', icon: 'sliders' },
    { id: 'duplicate', label: 'Duplicate', icon: 'plus' },
    { id: 'activate', label: 'Activate', icon: 'shield-check', when: (r) => r.status !== 'Active' },
    { id: 'deactivate', label: 'Deactivate', icon: 'ban', when: (r) => r.status === 'Active' },
    { id: 'delete', label: 'Delete', icon: 'ban', danger: true, when: (r) => !r.assigned },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'activate', label: 'Activate' }, { id: 'deactivate', label: 'Deactivate' }, { id: 'export', label: 'Export' }];

  protected readonly sel = computed(() => this.shifts().find((s) => s.code === this.selCode()) ?? null);
  protected readonly selKey = computed(() => this.selCode());
  protected readonly activeCount = computed(() => this.shifts().filter((s) => s.status === 'Active').length);
  protected readonly rules = computed<Rules>(() => this.rulesMap()[this.selCode() ?? ''] ?? { otAfter: this.sel()?.hours ?? 8, minRest: 11, maxDays: 6, swaps: true, nightPct: this.sel() && +this.sel()!.start.split(':')[0] >= 18 ? 15 : 0, autoOut: '23:59', policy: 'General Office' });
  protected readonly segments = computed(() => {
    const s = this.sel();
    if (!s || !s.start) return [];
    const seg = (a: string, b: string, brk: boolean, label: string) => {
      const l = (toM(a) / 1440) * 100;
      const w = (hrsBetween(a, b) * 60 / 1440) * 100;
      return l + w > 100 ? [{ l, w: 100 - l, brk, label }, { l: 0, w: l + w - 100, brk, label }] : [{ l, w, brk, label }];
    };
    return [
      ...seg(s.start, s.end, false, `${s.start}–${s.end}`),
      ...(s.start2 ? seg(s.start2, s.end2!, false, `${s.start2}–${s.end2}`) : []),
      ...s.breaks.flatMap((b) => seg(b.start, b.end, true, b.name)),
    ];
  });
  protected readonly assignedBySite = computed(() => {
    const s = this.sel()!;
    const shares = s.sites === 'All Sites' ? [['Head Office', 0.38], ['Manufacturing', 0.24], ['Warehouse', 0.18], ['Regional Office', 0.1], ['Other sites', 0.1]] : [[s.sites, 1]];
    return shares.map(([label, f]) => ({ label: label as string, value: Math.round(s.assigned * (f as number)), display: Math.round(s.assigned * (f as number)).toLocaleString() }));
  });
  protected readonly members = computed(() => {
    const s = this.sel()!;
    if (!s.assigned) return [];
    return RECORDS.filter((r) => s.sites === 'All Sites' || r.site === s.sites).filter((_, i) => i % (s.id + 3) === 0).slice(0, 8);
  });

  // ---------- Form ----------
  protected readonly form = signal<Shift | null>(null);
  protected readonly editing = signal<string | null>(null);
  protected readonly err = signal('');
  protected readonly formHours = computed(() => {
    const f = this.form();
    if (!f) return 0;
    return hrsBetween(f.start, f.end) + (f.pattern === 'Split' && f.start2 && f.end2 ? hrsBetween(f.start2, f.end2) : 0);
  });

  protected openForm(s?: Shift) {
    this.addMenu.set(false);
    this.err.set('');
    this.editing.set(s?.name ?? null);
    this.form.set(
      s ? { ...s } : { ...SHIFTS[0], id: 0, name: '', code: '', start: '09:00', end: '17:00', status: 'Draft', assigned: 0, description: '', breaks: [], color: 'var(--ka-7c3aed)', from: new Date().toISOString().slice(0, 10) },
    );
  }
  protected setF<K extends keyof Shift>(k: K, v: Shift[K]) {
    this.form.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected save() {
    const f = this.form()!;
    if (!f.name.trim() || !f.code.trim()) return this.err.set('Name and code are required.');
    const clash = this.shifts().find((s) => s.code === f.code && s.id !== f.id);
    if (clash) return this.err.set(`Code ${f.code} is already used by ${clash.name}.`);
    const shift = { ...f, hours: Math.round(this.formHours() * 10) / 10, site: f.sites };
    if (f.id) this.shifts.update((l) => l.map((s) => (s.id === f.id ? shift : s)));
    else this.shifts.update((l) => [{ ...shift, id: Math.max(...l.map((s) => s.id)) + 1 }, ...l]);
    this.selCode.set(f.code);
    this.log(f.id ? 'Shift details edited' : 'Shift created', f.code);
    this.form.set(null);
    this.notify(`${f.name} saved`);
  }
  protected duplicate(s: Shift) {
    this.addMenu.set(false);
    this.openForm({ ...s, id: 0, name: `${s.name} (copy)`, code: `${s.code}-C`, status: 'Draft', assigned: 0 });
    this.editing.set(null);
  }

  // ---------- Row actions ----------
  protected onAction(a: string, s: Shift) {
    if (a === 'view') return this.selCode.set(s.code);
    if (a === 'edit') return this.openForm(s);
    if (a === 'duplicate') return this.duplicate(s);
    if (a === 'delete') {
      this.shifts.update((l) => l.filter((x) => x.code !== s.code));
      if (this.selCode() === s.code) this.selCode.set(null);
      return this.notify(`${s.name} deleted`);
    }
    this.setStatus([s.code], a === 'activate' ? 'Active' : 'Inactive');
  }
  protected onBulk(a: string, codes: string[]) {
    if (a === 'export') return this.exportCsv(this.shifts().filter((s) => codes.includes(s.code)));
    this.setStatus(codes, a === 'activate' ? 'Active' : 'Inactive');
  }
  private setStatus(codes: string[], status: Shift['status']) {
    this.shifts.update((l) => l.map((s) => (codes.includes(s.code) ? { ...s, status } : s)));
    codes.forEach((c) => this.log(`Status changed to ${status}`, c));
    this.notify(`${codes.length} shift(s) ${status === 'Active' ? 'activated' : 'deactivated'}`);
  }
  protected patch(c: Partial<Shift>) {
    const code = this.selCode();
    this.shifts.update((l) => l.map((s) => (s.code === code ? { ...s, ...c } : s)));
  }

  // ---------- Breaks ----------
  protected startBreak() {
    const s = this.sel()!;
    this.patch({ breaks: [...s.breaks, { name: 'New Break', start: '12:00', end: '12:15', paid: true }] });
    this.editBreak.set(s.breaks.length);
  }
  protected saveBreak(i: number, name: string, start: string, end: string, paid: boolean) {
    const s = this.sel()!;
    this.patch({ breaks: s.breaks.map((b, j) => (j === i ? { name, start, end, paid } : b)) });
    this.editBreak.set(null);
    this.log(`Break “${name}” saved`);
  }
  protected removeBreak(i: number) {
    const s = this.sel()!;
    this.log(`Break “${s.breaks[i].name}” removed`);
    this.patch({ breaks: s.breaks.filter((_, j) => j !== i) });
  }
  protected setRule<K extends keyof Rules>(k: K, v: Rules[K]) {
    const code = this.selCode()!;
    this.rulesMap.update((m) => ({ ...m, [code]: { ...this.rules(), [k]: v } }));
  }

  // ---------- Helpers ----------
  protected statusTag(s: string) {
    return s === 'Active' ? 'tag green' : s === 'Draft' ? 'tag amber' : 'tag grey';
  }
  protected timeLabel(s: Shift) {
    return s.start ? `${s.start} – ${s.end}${s.start2 ? ` · ${s.start2} – ${s.end2}` : ''}` : 'Flexible / on call';
  }
  protected hm(h: number) {
    return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
  }
  protected dur(b: Brk) {
    return Math.round(hrsBetween(b.start, b.end) * 60);
  }
  protected breakMins(s: Shift, paid: boolean) {
    return s.breaks.filter((b) => b.paid === paid).reduce((a, b) => a + this.dur(b), 0);
  }
  protected dmy(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  protected log(what: string, code = this.selCode()!) {
    this.audit.update((a) => ({ ...a, [code]: [{ when: 'Just now', who: 'Demo login', what }, ...(a[code] ?? [])] }));
  }
  protected exportCsv(list = this.shifts()) {
    this.more.set(false);
    downloadCsv('shift-master.csv', [['Code', 'Name', 'Type', 'Pattern', 'Start', 'End', 'Hours', 'Grace', 'Status', 'Sites'], ...list.map((s) => [s.code, s.name, s.type, s.pattern, s.start, s.end, s.hours, s.grace, s.status, s.sites])]);
  }
  protected importFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => this.addFromCsv(String(r.result));
    r.readAsText(f);
  }
  protected importSample() {
    this.addMenu.set(false);
    this.addFromCsv('name,code,start,end\nEarly Bird,EB-01,05:30,13:30\nTwilight,TW-01,16:00,00:00\nMid Shift,MD-01,11:00,19:00');
  }
  private addFromCsv(text: string) {
    const rows = text.split(/\r?\n/).slice(1).filter((l) => l.trim()).map((l) => l.split(',').map((x) => x.trim()));
    let n = 0;
    for (const [name, code, start, end] of rows) {
      if (!name || !code || this.shifts().some((s) => s.code === code)) continue;
      const id = Math.max(...this.shifts().map((s) => s.id)) + 1;
      this.shifts.update((l) => [{ ...SHIFTS[0], id, name, code, start, end, hours: hrsBetween(start, end), status: 'Draft', assigned: 0, breaks: [], description: 'Imported shift', color: 'var(--ka-64748b)', from: new Date().toISOString().slice(0, 10) }, ...l]);
      n++;
    }
    this.notify(`${n} shift(s) imported as Draft`);
  }
  protected print() {
    this.more.set(false);
    window.print();
  }
  protected reset() {
    this.more.set(false);
    this.shifts.set(SHIFTS.map((s) => ({ ...s, breaks: s.breaks.map((b) => ({ ...b })) })));
    this.notify('Demo data reset');
  }
  notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2200);
  }
}
