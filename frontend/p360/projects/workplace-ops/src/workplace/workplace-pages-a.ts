import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { bookingTag, NOW_MIN, prioTag, reqTag, slaTag, WKpi, WP_CSS } from './workplace-ui';
import {
  addDays, Asset, avColor, Bay, Booking, CATEGORIES, FLOOR_HEAT, FLOORS, fmtD, HOURS, initials, ME, PARKING_LEVELS, Priority, Request, ReqStatus, ROOMS, Room,
  slaState, TEAMS, to12, toMin, TODAY, TOP_ZONES, UTIL_HOURS, WorkplaceStore, WP_SITES, zoneColor,
} from './workplace.data';

const toast = () => {
  const t = signal<string | null>(null);
  return { t, show: (m: string) => { t.set(m); setTimeout(() => t() === m && t.set(null), 2600); } };
};

/* =====================================================================
   Meeting Room Booking — day timeline (rooms × hours), quick book, approvals
   ===================================================================== */
@Component({
  selector: 'app-meeting-room-booking',
  imports: [...UI, WKpi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Meeting Room Booking" [parent]="parent" parentLink="/workplace-facility-services" subtitle="Find, book and manage meeting rooms, focus rooms and collaboration spaces in real time.">
      <button class="btn-primary hb" (click)="openBook()"><app-icon name="plus" [size]="18" />Book a Room</button>
      <button class="btn-ghost hb" (click)="exportDay()"><app-icon name="download" [size]="16" />Export Day</button>
    </app-page-head>
    <section class="kpis">
      <app-wkpi label="Total Rooms" [value]="rooms().length" icon="w-room" color="var(--ka-2563eb)" [sub]="'Across ' + sitesCount() + ' site' + (sitesCount() === 1 ? '' : 's')" />
      <app-wkpi label="Available Now" [value]="freeNow().length" icon="w-check-circle" color="var(--ka-16c26b)" [strong]="pctOf(freeNow().length, rooms().length)" sub="free right now" />
      <app-wkpi label="Bookings Today" [value]="dayBookings().length" icon="w-calendar" color="var(--ka-7c3aed)" [sub]="hoursBooked() + ' hrs booked'" />
      <app-wkpi label="Pending Approvals" [value]="pending()" icon="file-check" color="var(--ka-f5a524)" sub="board & training" [clickable]="true" (click)="go('approvals-sla')" />
      <app-wkpi label="Room Occupancy" value="68%" icon="w-bars" color="var(--ka-ef3b4f)" strong="5%" arrow="up" sub="vs. last week" />
    </section>

    <section class="wl">
      <div class="card">
        <div class="ch">
          <h3>Room Schedule</h3>
          <div class="tools">
            <button class="btn-ghost sm" (click)="shift(-1)"><app-icon name="chevron-left" [size]="14" /></button>
            <b class="dlabel">{{ fmtD(date()) }}{{ date() === today ? ' · Today' : '' }}</b>
            <button class="btn-ghost sm" (click)="shift(1)"><app-icon name="chevron-right" [size]="14" /></button>
            @if (date() !== today) {<button class="link" (click)="date.set(today)">Today</button>}
            <select class="select sm" [value]="site()" (change)="site.set($any($event.target).value)"><option>All Sites</option>@for (s of sites; track s) {<option>{{ s }}</option>}</select>
            <select class="select sm" [value]="kind()" (change)="kind.set($any($event.target).value)"><option value="all">All Room Types</option>@for (k of kinds; track k) {<option>{{ k }}</option>}</select>
          </div>
        </div>
        <div class="tl">
          <div class="tl-h"><span></span><div class="tl-hours">@for (h of hours.slice(0, -1); track h) {<span>{{ h }}</span>}</div></div>
          @for (r of rooms(); track r.id) {
            <div class="tl-r" [class.on]="selRoomId() === r.id">
              <button class="tl-n" (click)="selRoomId.set(r.id); selBk.set(null)"><i [style.background]="r.color"></i><span><b>{{ r.name }}</b><small>{{ r.site === 'Head Office' ? r.floor : r.site + ' · ' + r.floor }} · {{ r.capacity }} seats</small></span></button>
              <div class="tl-t" (click)="trackClick(r, $event)">
                @for (h of hours.slice(0, -1); track h) {<i class="tl-g"></i>}
                @for (b of bookingsOf(r); track b.id) {
                  <button class="blk" [class.mine]="b.by === me" [class.pend]="b.status === 'Pending'" [class.sel]="selBk() === b.id" [class.short]="pos(b).w < 12" [style.left.%]="pos(b).l" [style.width.%]="pos(b).w" [style.--c]="r.color" (click)="$event.stopPropagation(); selBk.set(b.id); selRoomId.set(r.id)" [title]="b.title + ' · ' + b.from + ' - ' + b.to">
                    <b>{{ b.by === me ? 'You · ' : '' }}{{ b.title }}</b><small>{{ b.from }} - {{ b.to }}</small>
                  </button>
                }
                @if (date() === today) {<span class="now" [style.left.%]="nowPct"></span>}
              </div>
            </div>
          }
        </div>
        <div class="tl-lg"><span><i class="lg1"></i>Booked</span><span><i class="lg2"></i>My booking</span><span><i class="lg3"></i>Pending approval</span><span><i class="lg4"></i>Now</span><span class="muted">Click an empty slot to book</span></div>
      </div>

      <div class="col detail">
        @if (bk(); as b) {
          <div class="card">
            <div class="ch"><h3>{{ b.title }}</h3><span [class]="bookingTag(b.status)">{{ b.status }}</span></div>
            <dl class="facts">
              <dt>Room</dt><dd>{{ b.resource }} · {{ b.location }}</dd>
              <dt>When</dt><dd>{{ fmtD(b.date) }} · {{ b.from }} - {{ b.to }}</dd>
              <dt>Organizer</dt><dd>{{ b.by }}</dd>
              <dt>Attendees</dt><dd>{{ b.attendees ?? 1 }}</dd>
              <dt>Booking ID</dt><dd>{{ b.id }}</dd>
            </dl>
            <div class="acts" style="margin-top:12px">
              @if (b.status === 'Pending') {<button class="btn-primary sm btn-sm" (click)="approve(b, true)">Approve</button><button class="btn-ghost sm danger" (click)="approve(b, false)">Reject</button>}
              @if (b.by === me && b.date === today && b.status === 'Confirmed') {<button class="btn-primary btn-sm" (click)="checkIn(b)">Check In</button>}
              @if (b.by === me) {<button class="btn-ghost sm danger" (click)="cancel(b)">Cancel booking</button>}
              @else {<button class="btn-ghost sm" (click)="msg('Message sent to ' + b.by)">Contact organizer</button>}
              <button class="btn-ghost sm" (click)="selBk.set(null)">Close</button>
            </div>
          </div>
        }
        @if (selRoom(); as r) {
          <div class="card">
            <div class="ch"><div class="rh"><span class="ic" [style.background]="r.color"><app-icon [name]="r.kind === 'Focus Room' ? 'w-focus' : 'users'" [size]="18" /></span><div><h3>{{ r.name }}</h3><small class="muted">{{ r.kind }} · {{ r.site }} · {{ r.floor }}</small></div></div>
              <span [class]="isFree(r) ? 'tag green' : 'tag red'">{{ isFree(r) ? 'Free now' : 'In use' }}</span></div>
            <div class="eq">@for (e of r.equipment; track e) {<span class="chip-s">{{ e }}</span>}<span class="chip-s">{{ r.capacity }} seats</span>@if (r.approval) {<span class="chip-s">Approval required</span>}</div>
            <h4 style="margin-top:12px">Agenda · {{ fmtD(date()) }}</h4>
            <div class="rows">
              @for (b of bookingsOf(r); track b.id) {
                <button class="row ag" (click)="selBk.set(b.id)"><span class="ic soft" [style.--c]="r.color"><app-icon name="clock" [size]="15" /></span><span class="nm"><b>{{ b.title }}</b><small>{{ b.from }} - {{ b.to }} · {{ b.by }}</small></span><span [class]="bookingTag(b.status)">{{ b.status }}</span></button>
              } @empty {<p class="empty">No bookings — the room is free all day.</p>}
            </div>
            <div class="acts" style="margin-top:10px"><button class="btn-primary btn-sm" (click)="openBook(r)">Book this room</button><button class="btn-ghost sm" (click)="reportIssue(r)">Report an issue</button></div>
          </div>
        }
        <div class="card">
          <div class="ch"><h3>Free Right Now</h3><span class="muted sm">next 60 min</span></div>
          <div class="rows">
            @for (r of freeNow().slice(0, 6); track r.id) {
              <div class="row"><span class="ic soft" [style.--c]="r.color"><app-icon [name]="r.kind === 'Focus Room' ? 'w-focus' : 'users'" [size]="16" /></span><span class="nm"><b>{{ r.name }}</b><small>{{ r.site }} · {{ r.floor }} · {{ r.capacity }} seats</small></span><button class="btn-ghost sm" (click)="quick(r)">Book 11:00</button></div>
            } @empty {<p class="empty">All rooms are busy.</p>}
          </div>
        </div>
      </div>
    </section>

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>Book a Room</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Room *<select class="select" [value]="f.room" (change)="form.set({ ...f, room: $any($event.target).value })">@for (r of allRooms; track r.id) {<option [value]="r.id">{{ r.name }} · {{ r.site }} {{ r.floor }} · {{ r.capacity }} seats</option>}</select></label>
          <label>Date<input class="input" type="date" [value]="f.date" min="2026-10-14" (change)="form.set({ ...f, date: $any($event.target).value })" /></label>
          <label>Start<select class="select" [value]="f.start" (change)="form.set({ ...f, start: $any($event.target).value })">@for (h of hours.slice(0, -1); track h) {<option>{{ h }}</option>}</select></label>
          <label>Duration<select class="select" [value]="f.dur" (change)="form.set({ ...f, dur: +$any($event.target).value })"><option value="1">1 hour</option><option value="2">2 hours</option><option value="3">3 hours</option></select></label>
          <label>Attendees<input class="input" type="number" min="1" [value]="f.att" (input)="form.set({ ...f, att: +$any($event.target).value })" /></label>
          <label class="full">Meeting title *<input class="input" [value]="f.title" (input)="form.set({ ...f, title: $any($event.target).value })" placeholder="e.g. Sprint planning" /></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary">Confirm Booking</button></div>
      </form>
    }
    @if (ts.t()) {<div class="g-toast">{{ ts.t() }}</div>}
  `,
  styles: [WP_CSS, `
    .dlabel { font-size: 13px; min-width: 150px; text-align: center; }
    .tl { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .tl-h, .tl-r { display: grid; grid-template-columns: 190px minmax(0, 1fr); }
    .tl-h { background: var(--kb-f8f8fc); border-bottom: 1px solid var(--border); font-size: 11px; color: var(--kf-52525b); }
    .tl-hours { display: grid; grid-template-columns: repeat(10, 1fr); } .tl-hours span { padding: 7px 4px; border-left: 1px solid var(--kl-eceef3); }
    .tl-r { border-bottom: 1px solid var(--kl-f0f1f6); min-height: 48px; } .tl-r:last-child { border-bottom: 0; } .tl-r.on { background: var(--kb-faf8ff); }
    .tl-n { display: flex; gap: 9px; align-items: center; padding: 6px 10px; border: 0; background: none; text-align: left; cursor: pointer; border-right: 1px solid var(--border); }
    .tl-n i { width: 8px; height: 30px; border-radius: 3px; flex-shrink: 0; } .tl-n span { display: flex; flex-direction: column; min-width: 0; } .tl-n b { font-size: 12.5px; } .tl-n small { font-size: 10.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tl-t { position: relative; display: grid; grid-template-columns: repeat(10, 1fr); cursor: copy; } .tl-g { border-left: 1px solid var(--kl-f0f1f6); } .tl-t:hover { background: var(--kb-fcfbff); }
    .blk { position: absolute; top: 6px; bottom: 6px; border: 0; border-left: 3px solid var(--c); background: color-mix(in srgb, var(--c) 14%, white); border-radius: 4px; padding: 2px 6px; text-align: left; cursor: pointer; overflow: hidden; display: flex; flex-direction: column; justify-content: center; }
    .blk.short small { display: none; } .blk.short { padding: 2px 4px; } .blk b { font-size: 10.5px; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .blk small { font-size: 10px; color: var(--kf-52525b); }
    .blk.mine { --c: var(--ka-7c3aed) !important; background: var(--kb-7c3aed); color: var(--kf-ffffff); } .blk.mine small { color: var(--kf-e9e3ff); }
    .blk.pend { background: repeating-linear-gradient(45deg, var(--kb-fef3c7), var(--kb-fef3c7) 6px, var(--kb-fde68a) 6px, var(--kb-fde68a) 12px); border-left-color: var(--kl-f59e0b); }
    .blk.sel { outline: 2px solid var(--kl-1e1b3a); outline-offset: 1px; }
    .now { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--kb-ef4444); pointer-events: none; } .now::before { content: ''; position: absolute; top: -1px; left: -3px; width: 8px; height: 8px; border-radius: 50%; background: var(--kb-ef4444); }
    .tl-lg { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; font-size: 11.5px; align-items: center; } .tl-lg span { display: inline-flex; gap: 6px; align-items: center; } .tl-lg i { width: 14px; height: 10px; border-radius: 2px; }
    .lg1 { background: var(--kb-fde2e2); border-left: 3px solid var(--kl-ef4444); } .lg2 { background: var(--kb-7c3aed); } .lg3 { background: var(--kb-fde68a); } .lg4 { background: var(--kb-ef4444); width: 3px !important; }
    .rh { display: flex; gap: 10px; align-items: center; } .rh h3 { margin: 0; }
    .eq { display: flex; flex-wrap: wrap; gap: 4px; }
    .ag { width: 100%; border: 0; border-bottom: 1px solid var(--kl-f0f1f6); background: none; text-align: left; cursor: pointer; font: inherit; } .ag:hover { background: var(--kb-faf8ff); }
  `],
})
export class RoomBooking {
  protected readonly store = inject(WorkplaceStore);
  private readonly router = inject(Router);
  protected readonly parent = 'Workplace & Facility Services';
  protected readonly fmtD = fmtD;
  protected readonly bookingTag = bookingTag;
  protected readonly today = TODAY;
  protected readonly me = ME;
  protected readonly hours = HOURS;
  protected readonly sites = WP_SITES;
  protected readonly allRooms = ROOMS;
  protected readonly kinds = ['Meeting Room', 'Focus Room', 'Collaboration Area', 'Board Room', 'Training Room'];
  protected readonly nowPct = ((NOW_MIN - 480) / 600) * 100;
  protected readonly ts = toast();
  protected readonly msg = this.ts.show;
  protected readonly date = signal(TODAY);
  protected readonly site = signal('All Sites');
  protected readonly kind = signal('all');
  protected readonly selRoomId = signal<string | null>('R1');
  protected readonly selBk = signal<string | null>(null);
  protected readonly err = signal('');
  protected readonly form = signal<{ room: string; date: string; start: string; dur: number; title: string; att: number } | null>(null);

  protected readonly rooms = computed(() => ROOMS.filter((r) => (this.site() === 'All Sites' || r.site === this.site()) && (this.kind() === 'all' || r.kind === this.kind())));
  protected readonly sitesCount = computed(() => new Set(this.rooms().map((r) => r.site)).size);
  protected readonly dayBookings = computed(() => this.store.bookings().filter((b) => b.date === this.date() && ROOMS.some((r) => r.id === b.resourceId) && b.status !== 'Cancelled' && b.status !== 'Rejected' && this.rooms().some((r) => r.id === b.resourceId)));
  protected readonly hoursBooked = computed(() => Math.round(this.dayBookings().reduce((a, b) => a + (toMin(b.to) - toMin(b.from)) / 60, 0)));
  protected readonly pending = computed(() => this.store.bookings().filter((b) => b.status === 'Pending' && ROOMS.some((r) => r.id === b.resourceId)).length);
  protected readonly freeNow = computed(() => this.rooms().filter((r) => this.isFree(r)));
  protected readonly selRoom = computed(() => ROOMS.find((r) => r.id === this.selRoomId()) ?? null);
  protected readonly bk = computed(() => this.store.bookings().find((b) => b.id === this.selBk()) ?? null);

  protected isFree(r: Room) {
    return !this.store.bookings().some((b) => b.resourceId === r.id && b.date === TODAY && b.status !== 'Cancelled' && b.status !== 'Rejected' && toMin(b.from) <= NOW_MIN + 30 && toMin(b.to) > NOW_MIN);
  }
  protected bookingsOf(r: Room) {
    return this.dayBookings().filter((b) => b.resourceId === r.id).sort((a, b) => toMin(a.from) - toMin(b.from));
  }
  protected pos(b: Booking) {
    const a = toMin(b.from), z = toMin(b.to);
    return { l: ((a - 480) / 600) * 100, w: ((z - a) / 600) * 100 };
  }
  protected pctOf(a: number, b: number) {
    return b ? Math.round((a / b) * 100) + '%' : '0%';
  }
  protected shift(n: number) {
    const d = addDays(this.date(), n);
    if (d < addDays(TODAY, -6)) return;
    this.date.set(d);
    this.selBk.set(null);
  }
  protected trackClick(r: Room, e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const h = 8 + Math.floor(((e.clientX - el.getBoundingClientRect().left) / el.clientWidth) * 10);
    this.openBook(r, `${String(h).padStart(2, '0')}:00`);
  }
  protected openBook(r: Room = this.selRoom() ?? ROOMS[0], start = '11:00') {
    this.err.set('');
    this.form.set({ room: r.id, date: this.date() < TODAY ? TODAY : this.date(), start, dur: 1, title: '', att: Math.min(4, r.capacity) });
  }
  protected quick(r: Room) {
    this.openBook(r, '11:00');
  }
  protected save() {
    const f = this.form()!;
    const r = ROOMS.find((x) => x.id === f.room)!;
    const h = +f.start.slice(0, 2);
    const from = to12(`${h}:00`), to = to12(`${Math.min(18, h + f.dur)}:00`);
    if (!f.title.trim()) return this.err.set('Please enter a meeting title.');
    if (f.att > r.capacity) return this.err.set(`${r.name} seats ${r.capacity}. Choose a bigger room.`);
    if (!this.store.roomFree(r, f.date, from, to)) return this.err.set(`${r.name} is already booked in that slot.`);
    const b = this.store.bookRoom(r, f.date, from, to, f.title, f.att);
    this.form.set(null);
    this.date.set(f.date);
    this.selRoomId.set(r.id);
    this.selBk.set(b.id);
    this.msg(b.status === 'Pending' ? `${r.name} requested · sent for approval` : `${r.name} booked · ${from} - ${to}`);
  }
  protected approve(b: Booking, ok: boolean) {
    this.store.updateBooking(b.id, { status: ok ? 'Confirmed' : 'Rejected' });
    this.msg(`${b.resource} · ${b.title} ${ok ? 'approved' : 'rejected'}`);
  }
  protected checkIn(b: Booking) {
    this.store.checkIn(b.id);
    this.msg(`Checked in to ${b.resource}`);
  }
  protected cancel(b: Booking) {
    this.store.cancel(b.id);
    this.selBk.set(null);
    this.msg(`${b.resource} booking cancelled`);
  }
  protected reportIssue(r: Room) {
    const q = this.store.addRequest({ title: `Issue reported in ${r.name}`, category: 'IT & AV', priority: 'Medium', site: r.site, location: `${r.site} - ${r.floor} - ${r.name}` });
    this.msg(`${q.id} raised · Facility team notified`);
  }
  protected exportDay() {
    downloadCsv(`room-bookings-${this.date()}.csv`, [['ID', 'Room', 'Location', 'Date', 'From', 'To', 'Title', 'Organizer', 'Attendees', 'Status'], ...this.dayBookings().map((b) => [b.id, b.resource, b.location, b.date, b.from, b.to, b.title ?? '', b.by, b.attendees ?? '', b.status])]);
  }
  protected go(p: string) {
    this.router.navigateByUrl(`/workplace-facility-services/${p}`);
  }
}

/* =====================================================================
   Parking Booking — level map with bays, EV charging, my parking
   ===================================================================== */
@Component({
  selector: 'app-parking-booking',
  imports: [...UI, WKpi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Parking Booking" [parent]="parent" parentLink="/workplace-facility-services" subtitle="Reserve parking bays, EV chargers and visitor spaces across all sites.">
      <button class="btn-primary hb" (click)="autoBook()"><app-icon name="w-zap" [size]="16" />Quick Book Nearest Bay</button>
      <button class="btn-ghost hb" (click)="go('service-catalog')"><app-icon name="w-car" [size]="17" />Visitor Parking Pass</button>
    </app-page-head>
    <section class="kpis">
      <app-wkpi label="Total Bays" [value]="all().length" icon="w-car" color="var(--ka-2563eb)" sub="Across 3 sites" />
      <app-wkpi label="Available Now" [value]="cnt().available" icon="w-check-circle" color="var(--ka-16c26b)" [strong]="pct(cnt().available)" sub="availability" />
      <app-wkpi label="Occupied" [value]="cnt().occupied" icon="w-car" color="var(--ka-7c3aed)" [strong]="pct(cnt().occupied)" strongColor="var(--ka-7c3aed)" />
      <app-wkpi label="EV Chargers in Use" [value]="ev().used + ' / ' + ev().total" icon="w-zap" color="var(--ka-f5a524)" [sub]="ev().kwh + ' kWh today'" />
      <app-wkpi label="My Parking Today" [value]="myBay()?.id ? 'Bay ' + myBay()!.level + '-' + myBay()!.row + myBay()!.n : '—'" icon="map-pin" color="var(--ka-ef3b4f)" [sub]="myBay() ? myBay()!.site + ' · Dubai A 48213' : 'No bay reserved'" />
    </section>

    <section class="wl">
      <div class="card">
        <div class="ch">
          <h3>Parking Map</h3>
          <div class="tools">
            <select class="select sm" [value]="site()" (change)="setSite($any($event.target).value)">@for (s of sites; track s) {<option>{{ s }}</option>}</select>
            <div class="seg">@for (l of levels(); track l) {<button [class.on]="level() === l" (click)="level.set(l)">Level {{ l }}</button>}</div>
            <select class="select sm" [value]="typeF()" (change)="typeF.set($any($event.target).value)"><option value="all">All Bay Types</option>@for (t of types; track t) {<option>{{ t }}</option>}</select>
          </div>
        </div>
        <svg viewBox="0 0 620 360" class="pk">
          <rect x="2" y="2" width="616" height="356" rx="6" fill="var(--ka-f4f4f6)" stroke="var(--kl-3f3f46)" stroke-width="3" />
          <rect x="20" y="78" width="586" height="44" fill="var(--ka-e4e4e7)" /><rect x="20" y="238" width="586" height="44" fill="var(--ka-e4e4e7)" /><rect x="2" y="78" width="18" height="204" fill="var(--ka-e4e4e7)" />
          @for (x of [90, 220, 350, 480]; track x) {<path [attr.d]="'M' + x + ' 100h18m-5 -4 5 4 -5 4'" stroke="var(--kl-a1a1aa)" stroke-width="2" fill="none" /><path [attr.d]="'M' + (x + 18) + ' 260h-18m5 -4 -5 4 5 4'" stroke="var(--kl-a1a1aa)" stroke-width="2" fill="none" />}
          <text x="6" y="104" class="gate">IN</text><text x="6" y="264" class="gate out">OUT</text>
          <text x="600" y="104" text-anchor="end" class="core">LIFTS ▸</text>
          @for (b of levelBays(); track b.id) {
            <g class="bay" [attr.transform]="'translate(' + b.px + ',' + b.py + ')'" [attr.opacity]="typeF() !== 'all' && b.type !== typeF() ? 0.25 : 1" (click)="sel.set(b.id)">
              <rect width="34" height="54" rx="2" [attr.fill]="fill(b)" [attr.stroke]="sel() === b.id ? 'var(--ka-7c3aed)' : 'var(--ka-a1a1aa)'" [attr.stroke-width]="sel() === b.id ? 2.5 : 1" />
              @if (b.status !== 'available') {<rect x="7" [attr.y]="b.up ? 8 : 14" width="20" height="32" rx="6" [attr.fill]="b.mine ? 'var(--ka-7c3aed)' : b.status === 'occupied' ? 'var(--ka-ef4444)' : 'var(--ka-9ca3af)'" /><rect x="10" [attr.y]="b.up ? 13 : 33" width="14" height="5" rx="1.5" fill="var(--ka-ffffff)" opacity=".7" />}
              <text x="17" [attr.y]="b.up ? 50 : 10" text-anchor="middle" class="bn">{{ b.row }}{{ b.n }}</text>
              @if (b.type !== 'Standard') {<text x="17" [attr.y]="b.status === 'available' ? 32 : (b.up ? 4 : 52)" text-anchor="middle" class="bt" [class.big]="b.status === 'available'">{{ typeMark[b.type] }}</text>}
              <title>Bay {{ b.row }}{{ b.n }} · {{ b.type }} · {{ b.status }}</title>
            </g>
          }
        </svg>
        <div class="tl-lg"><span><i style="background:var(--kb-dcfce7);border:1px solid var(--kl-22c55e)"></i>Available</span><span><i style="background:var(--kb-ef4444)"></i>Occupied</span><span><i style="background:var(--kb-9ca3af)"></i>Reserved</span><span><i style="background:var(--kb-7c3aed)"></i>My bay</span><span>⚡ EV</span><span>♿ Accessible</span><span>V Visitor</span><span>M Motorcycle</span></div>
        <h4 class="bt-h">Availability by Bay Type · {{ site() }}</h4>
        <div class="btypes">
          @for (t of byType(); track t.type) {
            <button class="btc" [class.on]="typeF() === t.type" (click)="typeF.set(typeF() === t.type ? 'all' : t.type)"><span>{{ t.mark }}</span><b>{{ t.free }}<small> / {{ t.total }}</small></b><em>{{ t.type }}</em></button>
          }
        </div>
      </div>

      <div class="col detail">
        <div class="card">
          @if (bay(); as b) {
            <div class="ch"><h3>Bay {{ b.level }}-{{ b.row }}{{ b.n }}</h3><span [class]="b.status === 'available' ? 'tag green' : b.mine ? 'tag' : b.status === 'occupied' ? 'tag red' : 'tag grey'">{{ b.mine ? 'Your bay' : b.status }}</span></div>
            <dl class="facts"><dt>Site</dt><dd>{{ b.site }} · Level {{ b.level }}</dd><dt>Type</dt><dd>{{ b.type }}</dd>@if (b.plate) {<dt>Vehicle</dt><dd>{{ b.plate }}</dd>}@if (b.charge) {<dt>Charging</dt><dd>{{ liveCharge(b) }}%</dd>}</dl>
            @if (b.status === 'available') {
              <div class="form-grid" style="margin-top:12px">
                <label>Date<input class="input" type="date" [value]="date()" min="2026-10-14" (change)="date.set($any($event.target).value)" /></label>
                <label>Time<select class="select" [value]="time()" (change)="time.set($any($event.target).value)"><option>08:00 AM - 06:00 PM</option><option>08:00 AM - 01:00 PM</option><option>01:00 PM - 08:00 PM</option></select></label>
                <label class="full">Vehicle<select class="select"><option>Dubai A 48213 · Tesla Model 3</option><option>Dubai K 11870 · Toyota Camry</option></select></label>
              </div>
              <button class="btn-primary block" (click)="book(b)">Reserve Bay</button>
            } @else if (b.mine) {
              <button class="btn-ghost block danger" (click)="cancelMine()">Release my bay</button>
            } @else {
              <button class="btn-ghost block" (click)="msg('You will be alerted when a ' + b.type + ' bay frees up')">Alert me when a similar bay frees up</button>
            }
          } @else {<p class="empty">Select a bay on the map to reserve it.</p>}
        </div>
        <div class="card">
          <div class="ch"><h3>My Parking Bookings</h3></div>
          <div class="rows">
            @for (b of mine(); track b.id) {
              <div class="row"><span class="ic" style="background:var(--kb-db2777)"><app-icon name="w-car" [size]="17" /></span><span class="nm"><b>{{ b.resource }}</b><small>{{ b.location }} · {{ fmtD(b.date) }} · {{ b.from }} - {{ b.to }}</small></span><button class="btn-ghost sm danger" (click)="store.cancel(b.id); msg(b.resource + ' released')">Cancel</button></div>
            } @empty {<p class="empty">No parking reserved.</p>}
          </div>
        </div>
        <div class="card">
          <div class="ch"><h3>EV Charging Sessions</h3><span class="chip live"><i></i>Live</span></div>
          <div class="rows">
            @for (b of evSessions(); track b.id) {
              <div class="row ev"><span class="ic" style="background:var(--kb-f59e0b)"><app-icon name="w-zap" [size]="16" /></span><span class="nm"><b>{{ b.plate }} · Bay {{ b.level }}-{{ b.row }}{{ b.n }}</b><span class="bar"><i [style.width.%]="liveCharge(b)" [style.background]="liveCharge(b) > 80 ? 'var(--ka-22c55e)' : 'var(--ka-f59e0b)'"></i></span></span><b>{{ liveCharge(b) }}%</b></div>
            } @empty {<p class="empty">No active sessions on this site.</p>}
          </div>
        </div>
        <div class="card">
          <div class="ch"><h3>Occupancy by Level</h3></div>
          <app-bar-list [rows]="byLevel()" />
        </div>
      </div>
    </section>
    @if (ts.t()) {<div class="g-toast">{{ ts.t() }}</div>}
  `,
  styles: [WP_CSS, `
    .pk { width: 100%; display: block; } .bay { cursor: pointer; } .bay:hover rect:first-child { stroke: var(--kl-7c3aed); }
    .bn { font-size: 7px; fill: var(--ka-52525b); font-weight: 600; } .bt { font-size: 8px; fill: var(--ka-27272a); font-weight: 700; } .bt.big { font-size: 14px; fill: var(--ka-16a34a); }
    .gate { font-size: 8px; font-weight: 700; fill: var(--ka-16a34a); } .gate.out { fill: var(--ka-ef4444); } .core { font-size: 8px; fill: var(--ka-52525b); font-weight: 600; }
    .tl-lg { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: 11.5px; } .tl-lg span { display: inline-flex; gap: 6px; align-items: center; } .tl-lg i { width: 12px; height: 12px; border-radius: 3px; }
    .block { width: 100%; justify-content: center; margin-top: 12px; padding: 10px; }
    .ev .nm { gap: 5px; }
    .bt-h { margin: 16px 0 8px; } .btypes { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
    .btc { display: grid; grid-template-columns: 26px 1fr; grid-template-rows: auto auto; gap: 0 8px; align-items: center; text-align: left; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); cursor: pointer; font: inherit; color: inherit; }
    .btc.on { border-color: var(--primary); background: var(--kb-faf8ff); } .btc span { grid-row: span 2; font-size: 18px; text-align: center; color: var(--kf-16a34a); font-weight: 700; } .btc b { font-size: 16px; } .btc small { font-size: 11px; color: var(--muted); font-weight: 400; } .btc em { font-style: normal; font-size: 11px; color: var(--kf-52525b); }
  `],
})
export class ParkingBooking {
  protected readonly store = inject(WorkplaceStore);
  private readonly app = inject(AppState);
  private readonly router = inject(Router);
  protected readonly parent = 'Workplace & Facility Services';
  protected readonly fmtD = fmtD;
  protected readonly sites = WP_SITES;
  protected readonly types = ['Standard', 'EV Charging', 'Accessible', 'Visitor', 'Motorcycle'];
  protected readonly typeMark: Record<string, string> = { 'EV Charging': '⚡', Accessible: '♿', Visitor: 'V', Motorcycle: 'M' };
  protected readonly ts = toast();
  protected readonly msg = this.ts.show;
  protected readonly site = signal('Head Office');
  protected readonly level = signal('B1');
  protected readonly typeF = signal('all');
  protected readonly sel = signal<string | null>(null);
  protected readonly date = signal(TODAY);
  protected readonly time = signal('08:00 AM - 06:00 PM');

  protected readonly all = this.store.bays;
  protected readonly levels = computed(() => PARKING_LEVELS[this.site()]);
  protected readonly cnt = computed(() => {
    const c = { available: 0, occupied: 0, reserved: 0 };
    for (const b of this.all()) c[b.status]++;
    return c;
  });
  protected readonly ev = computed(() => {
    const l = this.all().filter((b) => b.type === 'EV Charging');
    return { total: l.length, used: l.filter((b) => b.status === 'occupied').length, kwh: 412 + this.app.tick() * 2 };
  });
  protected readonly myBay = computed(() => this.all().find((b) => b.mine) ?? null);
  protected readonly bay = computed(() => this.all().find((b) => b.id === this.sel()) ?? null);
  protected readonly mine = computed(() => this.store.myUpcoming().filter((b) => b.kind === 'Parking'));
  protected readonly levelBays = computed(() => {
    const rows = this.site() === 'Head Office' ? ['A', 'B', 'C', 'D'] : this.site() === 'Tech Park' ? ['A', 'B', 'C'] : ['A', 'B'];
    const slots = rows.length === 4 ? [0, 1, 2, 3] : rows.length === 3 ? [0, 1, 3] : [0, 3];
    return this.all().filter((b) => b.site === this.site() && b.level === this.level()).map((b) => {
      const k = slots[rows.indexOf(b.row)];
      return { ...b, px: 30 + (b.n - 1) * 38, py: [20, 126, 180, 286][k], up: k === 1 || k === 3 };
    });
  });
  protected readonly byType = computed(() => this.types.map((type) => {
    const l = this.all().filter((b) => b.site === this.site() && b.type === type);
    return { type, mark: this.typeMark[type] ?? 'P', total: l.length, free: l.filter((b) => b.status === 'available').length };
  }));
  protected readonly evSessions = computed(() => this.all().filter((b) => b.site === this.site() && b.type === 'EV Charging' && b.status === 'occupied').slice(0, 5));
  protected readonly byLevel = computed(() => WP_SITES.flatMap((s) => PARKING_LEVELS[s].map((l) => {
    const bays = this.all().filter((b) => b.site === s && b.level === l);
    const v = Math.round((bays.filter((b) => b.status !== 'available').length / bays.length) * 100);
    return { label: `${s} · ${l}`, value: v, display: v + '%', color: zoneColor(v) };
  })));

  protected pct(n: number) {
    return ((n / this.all().length) * 100).toFixed(1) + '%';
  }
  protected fill(b: Bay) {
    return b.status === 'available' ? 'var(--ka-dcfce7)' : 'var(--ka-ffffff)';
  }
  protected liveCharge(b: Bay) {
    return Math.min(100, (b.charge ?? 0) + Math.floor(this.app.tick() / 3));
  }
  protected setSite(s: string) {
    this.site.set(s);
    this.level.set(PARKING_LEVELS[s][0]);
    this.sel.set(null);
  }
  protected book(b: Bay) {
    if (this.myBay() && this.date() === TODAY) return this.msg(`You already hold Bay ${this.myBay()!.level}-${this.myBay()!.row}${this.myBay()!.n} today`);
    const [from, to] = this.time().split(' - ');
    this.store.bookBay(b, this.date(), from, to);
    this.msg(`Bay ${b.level}-${b.row}${b.n} reserved · ${fmtD(this.date())} · QR pass sent to your phone`);
  }
  protected autoBook() {
    const b = this.all().find((x) => x.site === this.site() && x.status === 'available' && x.type === 'Standard');
    if (!b) return this.msg('No standard bays free on this site');
    this.level.set(b.level);
    this.sel.set(b.id);
    this.book(b);
  }
  protected cancelMine() {
    const b = this.store.myToday().find((x) => x.kind === 'Parking');
    if (b) this.store.cancel(b.id);
    else this.store.bays.update((l) => l.map((x) => (x.mine ? { ...x, mine: false, status: 'available', plate: undefined } : x)));
    this.msg('Bay released');
  }
  protected go(p: string) {
    this.router.navigateByUrl(`/workplace-facility-services/${p}`);
  }
}

/* =====================================================================
   Facility Requests — ticket table, detail panel, assign / progress / resolve
   ===================================================================== */
@Component({
  selector: 'app-facility-requests',
  imports: [...UI, WKpi, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Facility Requests" [parent]="parent" parentLink="/workplace-facility-services" subtitle="Raise, track and resolve workplace issues — HVAC, cleaning, IT & AV, furniture and more.">
      <button class="btn-primary hb" (click)="openNew()"><app-icon name="plus" [size]="18" />New Request</button>
      <button class="btn-ghost hb" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpis">
      <app-wkpi label="Open Requests" [value]="open().length" icon="message" color="var(--ka-2563eb)" [sub]="list().length + ' total this month'" />
      <app-wkpi label="Critical / High" [value]="hot()" icon="triangle-alert" color="var(--ka-ef3b4f)" sub="need attention" />
      <app-wkpi label="SLA Breached" [value]="breached()" icon="w-timer" color="var(--ka-f5a524)" [strong]="breachPct()" strongColor="var(--ka-ef4444)" sub="of open requests" />
      <app-wkpi label="Avg Resolution Time" value="5.2 hrs" icon="clock" color="var(--ka-7c3aed)" strong="12%" arrow="down" sub="faster vs. last month" />
      <app-wkpi label="Satisfaction (CSAT)" value="4.6 / 5" icon="star" color="var(--ka-16c26b)" sub="from 312 ratings" />
    </section>
    <section class="wl three">
      <div class="card">
        <div class="ch"><h3>Open by Category</h3></div>
        <app-bar-list [rows]="byCat().slice(0, 6)" [max]="maxCat()" />
      </div>
      <div class="card">
        <div class="ch"><h3>SLA Status (open)</h3></div>
        <app-donut [segments]="slaSegs()" center="Open" [size]="130" />
      </div>
      <div class="card">
        <div class="ch"><h3>Team Workload</h3></div>
        <div class="rows">
          @for (t of workload(); track t.team) {<div class="row wlr"><span class="ic soft" style="--c:var(--ka-7c3aed)"><app-icon name="users" [size]="15" /></span><span class="nm"><b>{{ t.team }}</b><span class="bar"><i [style.width.%]="(t.n / maxLoad()) * 100" style="background:var(--kb-7c3aed)"></i></span></span><b>{{ t.n }}</b></div>}
        </div>
      </div>
    </section>
    <div class="card">
      <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" noun="requests"
        [searchKeys]="['id', 'title', 'location', 'requester', 'assignee']" searchPlaceholder="Search ID, title, location, requester..." [activeId]="selId()"
        (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
    </div>
        @if (sel(); as q) {
          <div class="g-overlay" (click)="selId.set(null)"></div>
          <aside class="g-drawer wide">
            <div class="ch"><div><small class="muted">{{ q.id }} · {{ q.category }}</small><h3>{{ q.title }}</h3></div><button class="close-btn" (click)="selId.set(null)">×</button></div>
            <div class="acts" style="margin-bottom:10px"><span [class]="prioTag(q.priority)">{{ q.priority }}</span><span [class]="reqTag(q.status)">{{ q.status }}</span><span [class]="slaTag(sla(q))">SLA {{ sla(q) }}</span>@if (q.approval) {<span [class]="q.approval === 'Approved' ? 'tag green' : q.approval === 'Pending' ? 'tag amber' : 'tag red'">Approval {{ q.approval }}</span>}</div>
            <dl class="facts">
              <dt>Location</dt><dd>{{ q.location }}</dd><dt>Requester</dt><dd>{{ q.requester }}</dd><dt>Assigned to</dt><dd>{{ q.assignee }}</dd>
              <dt>Raised</dt><dd>{{ ago(q.createdH) }}</dd><dt>SLA target</dt><dd>{{ q.slaH }} hrs ({{ q.priority }})</dd>@if (q.cost) {<dt>Est. cost</dt><dd>AED {{ q.cost.toLocaleString() }}</dd>}
            </dl>
            @if (q.status !== 'Resolved' && q.status !== 'Closed') {<div class="slab"><span>SLA used</span><div class="bar"><i [style.width.%]="min(100, (q.createdH / q.slaH) * 100)" [style.background]="sla(q) === 'Breached' ? 'var(--ka-ef4444)' : sla(q) === 'At Risk' ? 'var(--ka-f59e0b)' : 'var(--ka-22c55e)'"></i></div><b>{{ min(999, round((q.createdH / q.slaH) * 100)) }}%</b></div>}
            <div class="form-grid" style="margin-top:12px">
              <label>Assign to<select class="select" [value]="q.assignee" (change)="assign(q, $any($event.target).value)"><option>Unassigned</option>@for (t of teams; track t) {<option>{{ t }}</option>}</select></label>
              <label>Status<select class="select" [value]="q.status" (change)="setStatus(q, $any($event.target).value)">@for (s of statuses; track s) {<option>{{ s }}</option>}</select></label>
            </div>
            <div class="note"><input class="input" placeholder="Add an update or note…" [value]="note()" (input)="note.set($any($event.target).value)" (keydown.enter)="addNote(q)" /><button class="btn-primary btn-sm" (click)="addNote(q)">Post</button></div>
            <h4 style="margin-top:12px">Activity</h4>
            <ul class="timeline">@for (n of q.notes; track $index) {<li><b>{{ n.by }}</b> · {{ n.text }}<small>{{ n.at }}</small></li>}</ul>
            <div class="acts">
              @if (q.status !== 'Resolved' && q.status !== 'Closed') {<button class="btn-primary btn-sm" (click)="act('resolve', q)">Mark Resolved</button><button class="btn-ghost sm danger" (click)="act('escalate', q)">Escalate</button>}
              @else {<button class="btn-ghost sm" (click)="act('reopen', q)">Reopen</button>}
            </div>
          </aside>
        }
    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>New Facility Request</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Title *<input class="input" [value]="f.title" (input)="form.set({ ...f, title: $any($event.target).value })" placeholder="Describe the issue" /></label>
          <label>Category<select class="select" [value]="f.category" (change)="form.set({ ...f, category: $any($event.target).value })">@for (c of cats; track c) {<option>{{ c }}</option>}</select></label>
          <label>Priority<select class="select" [value]="f.priority" (change)="form.set({ ...f, priority: $any($event.target).value })"><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label>
          <label>Site<select class="select" [value]="f.site" (change)="form.set({ ...f, site: $any($event.target).value })">@for (s of sites; track s) {<option>{{ s }}</option>}</select></label>
          <label>Floor / Area<input class="input" [value]="f.area" (input)="form.set({ ...f, area: $any($event.target).value })" /></label>
        </div>
        <p class="muted sm">SLA target: {{ slaFor(f.priority) }} hrs · auto-routed to {{ routeFor(f.category) }}</p>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary">Submit Request</button></div>
      </form>
    }
    @if (ts.t()) {<div class="g-toast">{{ ts.t() }}</div>}
  `,
  styles: [WP_CSS, `
    .ch h3 { margin-top: 2px; } .slab { display: grid; grid-template-columns: 70px 1fr 44px; gap: 8px; align-items: center; margin-top: 10px; font-size: 12px; } .slab b { text-align: right; }
    .note { display: flex; gap: 6px; margin-top: 12px; } .note .input { flex: 1; }
    .wlr { padding: 6px 0; } .wlr .nm { gap: 4px; } .g-drawer h3 { font-size: 18px; }
  `],
})
export class FacilityRequests {
  protected readonly store = inject(WorkplaceStore);
  protected readonly parent = 'Workplace & Facility Services';
  protected readonly prioTag = prioTag;
  protected readonly reqTag = reqTag;
  protected readonly slaTag = slaTag;
  protected readonly sla = slaState;
  protected readonly min = Math.min;
  protected readonly round = Math.round;
  protected readonly teams = TEAMS;
  protected readonly cats = CATEGORIES;
  protected readonly sites = WP_SITES;
  protected readonly statuses: ReqStatus[] = ['Open', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed'];
  protected readonly ts = toast();
  protected readonly selId = signal<string | null>(null);
  protected readonly note = signal('');
  protected readonly err = signal('');
  protected readonly form = signal<{ title: string; category: string; priority: Priority; site: string; area: string } | null>(null);

  protected readonly list = computed(() => this.store.requests().filter((q) => q.kind !== 'Maintenance'));
  protected readonly rows = computed(() => this.list().map((q) => ({ ...q, sla: slaState(q), age: this.ago(q.createdH), color: 'var(--ka-7c3aed)', icon: 'message' })));
  protected readonly open = computed(() => this.list().filter((q) => q.status !== 'Resolved' && q.status !== 'Closed'));
  protected readonly hot = computed(() => this.open().filter((q) => q.priority === 'Critical' || q.priority === 'High').length);
  protected readonly breached = computed(() => this.open().filter((q) => slaState(q) === 'Breached').length);
  protected readonly breachPct = computed(() => Math.round((this.breached() / (this.open().length || 1)) * 100) + '%');
  protected readonly sel = computed(() => this.list().find((q) => q.id === this.selId()) ?? null);
  protected readonly byCat = computed(() => CATEGORIES.map((c, i) => ({ label: c, value: this.open().filter((q) => q.category === c).length, color: ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f59e0b)', 'var(--ka-ef4444)'][i % 5] })).filter((r) => r.value).sort((a, b) => b.value - a.value));
  protected readonly workload = computed(() => ['Unassigned', ...TEAMS].map((team) => ({ team, n: this.open().filter((q) => q.assignee === team).length })).filter((t) => t.n).sort((a, b) => b.n - a.n).slice(0, 5));
  protected readonly maxLoad = computed(() => Math.max(1, ...this.workload().map((t) => t.n)));
  protected readonly maxCat = computed(() => Math.max(1, ...this.byCat().map((r) => r.value)));
  protected readonly slaSegs = computed(() => {
    const o = this.open();
    return [
      { label: 'On Track', value: o.filter((q) => slaState(q) === 'On Track').length, color: 'var(--ka-22c55e)' },
      { label: 'At Risk', value: o.filter((q) => slaState(q) === 'At Risk').length, color: 'var(--ka-f59e0b)' },
      { label: 'Breached', value: o.filter((q) => slaState(q) === 'Breached').length, color: 'var(--ka-ef4444)' },
    ];
  });
  protected readonly cols: Col[] = [
    { key: 'id', label: 'Request ID' },
    { key: 'title', label: 'Request', sub: 'category' },
    { key: 'location', label: 'Location' },
    { key: 'priority', label: 'Priority', kind: 'tag', tag: (r) => prioTag(r.priority) },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => reqTag(r.status) },
    { key: 'assignee', label: 'Assigned To' },
    { key: 'sla', label: 'SLA', kind: 'tag', tag: (r) => slaTag(r.sla) },
    { key: 'age', label: 'Raised' },
  ];
  protected readonly filters = [
    { key: 'status', label: 'Status', options: this.statuses },
    { key: 'priority', label: 'Priority', options: ['Critical', 'High', 'Medium', 'Low'] },
    { key: 'category', label: 'Category', options: CATEGORIES },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View details', icon: 'eye' },
    { id: 'assign', label: 'Assign to Facilities Team A', icon: 'user-check', when: (r) => r.assignee === 'Unassigned' },
    { id: 'start', label: 'Start work', icon: 'play', when: (r) => r.status === 'Open' || r.status === 'Assigned' },
    { id: 'resolve', label: 'Mark resolved', icon: 'w-check-circle', when: (r) => r.status !== 'Resolved' && r.status !== 'Closed' },
    { id: 'escalate', label: 'Escalate', icon: 'triangle-alert', danger: true, when: (r) => r.status !== 'Resolved' && r.status !== 'Closed' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'assign', label: 'Assign to Team A' }, { id: 'resolve', label: 'Resolve' }, { id: 'export', label: 'Export' }];

  protected ago(h: number) {
    return h < 1 ? `${Math.round(h * 60)} min ago` : h < 24 ? `${Math.round(h)} hrs ago` : Math.round(h / 24) === 1 ? '1 day ago' : `${Math.round(h / 24)} days ago`;
  }
  protected act(a: string, q: Request) {
    if (a === 'view') return this.selId.set(q.id);
    if (a === 'assign') this.assign(q, 'Facilities Team A');
    if (a === 'start') this.setStatus(q, 'In Progress');
    if (a === 'resolve') this.setStatus(q, 'Resolved');
    if (a === 'reopen') this.setStatus(q, 'Open');
    if (a === 'escalate') {
      this.store.patchRequest(q.id, { priority: q.priority === 'Low' ? 'Medium' : q.priority === 'Medium' ? 'High' : 'Critical' }, 'Escalated to Facility Manager');
      this.ts.show(`${q.id} escalated to Facility Manager`);
    }
  }
  protected assign(q: Request, team: string) {
    this.store.patchRequest(q.id, { assignee: team, status: q.status === 'Open' ? 'Assigned' : q.status }, `Assigned to ${team}`);
    this.ts.show(`${q.id} assigned to ${team}`);
  }
  protected setStatus(q: Request, s: ReqStatus) {
    this.store.patchRequest(q.id, { status: s }, `Status changed to ${s}`);
    this.ts.show(`${q.id} → ${s}`);
  }
  protected addNote(q: Request) {
    if (!this.note().trim()) return;
    this.store.patchRequest(q.id, {}, this.note().trim());
    this.note.set('');
  }
  protected bulkAct(a: string, ids: string[]) {
    if (a === 'export') return this.exportCsv(this.list().filter((q) => ids.includes(q.id)));
    ids.forEach((id) => this.store.patchRequest(id, a === 'assign' ? { assignee: 'Facilities Team A', status: 'Assigned' } : { status: 'Resolved' }, a === 'assign' ? 'Bulk assigned' : 'Bulk resolved'));
    this.ts.show(`${ids.length} requests updated`);
  }
  protected slaFor(p: Priority) {
    return { Critical: 4, High: 8, Medium: 24, Low: 72 }[p];
  }
  protected routeFor(c: string) {
    return c === 'IT & AV' ? 'IT Service Desk' : c === 'Cleaning' ? 'Housekeeping' : c === 'Security' ? 'Security Desk' : 'Facilities Team A';
  }
  protected openNew() {
    this.err.set('');
    this.form.set({ title: '', category: 'HVAC', priority: 'Medium', site: 'Head Office', area: 'Floor 5 - Open Workspace' });
  }
  protected save() {
    const f = this.form()!;
    if (!f.title.trim()) return this.err.set('Please describe the issue.');
    const q = this.store.addRequest({ title: f.title, category: f.category, priority: f.priority, site: f.site, location: `${f.site} - ${f.area}`, assignee: this.routeFor(f.category), status: 'Assigned' });
    this.form.set(null);
    this.selId.set(q.id);
    this.ts.show(`${q.id} created · routed to ${q.assignee}`);
  }
  protected exportCsv(l = this.list()) {
    downloadCsv('facility-requests.csv', [['ID', 'Title', 'Category', 'Location', 'Priority', 'Status', 'Assignee', 'Requester', 'SLA'], ...l.map((q) => [q.id, q.title, q.category, q.location, q.priority, q.status, q.assignee, q.requester, slaState(q)])]);
  }
}

/* =====================================================================
   Asset & Equipment Booking — catalog, reserve, my equipment
   ===================================================================== */
@Component({
  selector: 'app-asset-equipment-booking',
  imports: [...UI, WKpi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Asset & Equipment Booking" [parent]="parent" parentLink="/workplace-facility-services" subtitle="Borrow laptops, AV kits, cameras and other shared equipment from the workplace store.">
      <button class="btn-primary hb" (click)="selId.set(filtered()[0]?.id ?? null)"><app-icon name="plus" [size]="18" />Reserve Equipment</button>
      <button class="btn-ghost hb" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export Inventory</button>
    </app-page-head>
    <section class="kpis">
      <app-wkpi label="Total Assets" [value]="tot().total" icon="w-package" color="var(--ka-2563eb)" [sub]="store.assets().length + ' asset types'" />
      <app-wkpi label="Available" [value]="tot().avail" icon="w-check-circle" color="var(--ka-16c26b)" [strong]="pct(tot().avail)" sub="ready to borrow" />
      <app-wkpi label="Checked Out" [value]="tot().out" icon="w-laptop" color="var(--ka-7c3aed)" [strong]="pct(tot().out)" strongColor="var(--ka-7c3aed)" />
      <app-wkpi label="Reserved Today" [value]="tot().res" icon="w-calendar" color="var(--ka-f5a524)" sub="pickup at store" />
      <app-wkpi label="Needs Service" [value]="tot().svc" icon="w-wrench" color="var(--ka-ef3b4f)" sub="sent to maintenance" />
    </section>
    <section class="wl">
      <div class="card">
        <div class="ch">
          <div class="seg">@for (c of cats; track c) {<button [class.on]="cat() === c" (click)="cat.set(c)">{{ c }}</button>}</div>
          <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search equipment…" [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        </div>
        <div class="grid">
          @for (a of filtered(); track a.id) {
            <button class="ac" [class.on]="selId() === a.id" (click)="selId.set(a.id)">
              <div class="ac-h"><span class="ic soft" style="--c:var(--ka-7c3aed)"><app-icon [name]="a.icon" [size]="20" /></span><span [class]="a.condition === 'Good' ? 'tag green' : a.condition === 'Fair' ? 'tag amber' : 'tag red'">{{ a.condition }}</span></div>
              <b>{{ a.name }}</b><small>{{ a.category }} · {{ a.site }}</small>
              <div class="bar"><i [style.width.%]="(free(a) / a.total) * 100" [style.background]="free(a) ? 'var(--ka-22c55e)' : 'var(--ka-ef4444)'"></i></div>
              <small><b>{{ free(a) }}</b> of {{ a.total }} available @if (a.deposit) { · approval}</small>
            </button>
          } @empty {<p class="empty">No equipment matches.</p>}
        </div>
      </div>
      <div class="col detail">
        <div class="card">
          @if (sel(); as a) {
            <div class="ch"><h3>{{ a.name }}</h3><span class="muted sm">{{ a.id }}</span></div>
            <dl class="facts"><dt>Category</dt><dd>{{ a.category }}</dd><dt>Location</dt><dd>{{ a.site }} · Equipment Store</dd><dt>Available</dt><dd>{{ free(a) }} / {{ a.total }}</dd><dt>Policy</dt><dd>{{ a.deposit ? 'Manager approval · max 3 days' : 'Self-service · max 5 days' }}</dd></dl>
            <div class="form-grid" style="margin-top:12px">
              <label>Pickup date<input class="input" type="date" [value]="date()" min="2026-10-14" (change)="date.set($any($event.target).value)" /></label>
              <label>Return<select class="select" [value]="ret()" (change)="ret.set($any($event.target).value)"><option>Same day</option><option>Next day</option><option>In 3 days</option></select></label>
              <label>Quantity<input class="input" type="number" min="1" [max]="free(a)" [value]="qty()" (input)="qty.set(+$any($event.target).value || 1)" /></label>
              <label>Purpose<select class="select"><option>Client presentation</option><option>Remote work</option><option>Event</option><option>Training</option></select></label>
            </div>
            @if (free(a) > 0) {<button class="btn-primary block" (click)="reserve(a)">{{ a.deposit ? 'Request Reservation' : 'Reserve Now' }}</button>}
            @else {<button class="btn-ghost block" (click)="ts.show('Added to waitlist for ' + a.name)">Join Waitlist</button>}
            @if (a.condition !== 'Good') {<button class="link" style="margin-top:8px" (click)="service(a)">Raise maintenance ticket</button>}
          } @else {<p class="empty">Pick an item to reserve it.</p>}
        </div>
        <div class="card">
          <div class="ch"><h3>My Equipment</h3></div>
          <div class="rows">
            @for (b of mine(); track b.id) {
              <div class="row"><span class="ic" style="background:var(--kb-0891b2)"><app-icon name="w-laptop" [size]="16" /></span><span class="nm"><b>{{ b.resource }}</b><small>{{ fmtD(b.date) }} · return {{ b.to }} · {{ b.status }}</small></span>
                <span class="acts">@if (b.status === 'Checked In') {<button class="btn-ghost sm" (click)="returnIt(b)">Return</button>} @else {<button class="btn-ghost sm" (click)="pickup(b)">Pick up</button><button class="btn-ghost sm danger" (click)="store.cancel(b.id)">Cancel</button>}</span></div>
            } @empty {<p class="empty">Nothing borrowed right now.</p>}
          </div>
        </div>
        <div class="card">
          <div class="ch"><h3>Overdue Returns</h3><span class="tag red">{{ overdue().length }}</span></div>
          <div class="rows">
            @for (o of overdue(); track o.who) {
              <div class="row"><span class="dt-av" [style.background]="av(o.who)">{{ ini(o.who) }}</span><span class="nm"><b>{{ o.who }}</b><small>{{ o.item }} · {{ o.days }} days overdue</small></span><button class="btn-ghost sm" (click)="remind(o.who)">{{ reminded().has(o.who) ? 'Reminded ✓' : 'Remind' }}</button></div>
            }
          </div>
        </div>
      </div>
    </section>
    @if (ts.t()) {<div class="g-toast">{{ ts.t() }}</div>}
  `,
  styles: [WP_CSS, `
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
    .ac { display: flex; flex-direction: column; gap: 6px; text-align: left; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-ffffff); cursor: pointer; font: inherit; color: inherit; }
    .ac:hover { border-color: var(--kl-c4b5fd); } .ac.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .ac-h { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; } .ac b { font-size: 13px; } .ac small { font-size: 11.5px; color: var(--muted); }
    .block { width: 100%; justify-content: center; margin-top: 12px; padding: 10px; }
    .search-box input { width: 200px; }
  `],
})
export class AssetBooking {
  protected readonly store = inject(WorkplaceStore);
  protected readonly parent = 'Workplace & Facility Services';
  protected readonly fmtD = fmtD;
  protected readonly av = avColor;
  protected readonly ini = initials;
  protected readonly ts = toast();
  protected readonly cats = ['All', 'Laptops', 'AV Equipment', 'Peripherals', 'Tablets', 'Innovation', 'Furniture'];
  protected readonly cat = signal('All');
  protected readonly q = signal('');
  protected readonly selId = signal<string | null>('AS-03');
  protected readonly date = signal(TODAY);
  protected readonly ret = signal('Next day');
  protected readonly qty = signal(1);
  protected readonly reminded = signal(new Set<string>());
  protected readonly overdue = signal([{ who: 'Daniel Brooks', item: 'MacBook Pro 14"', days: 3 }, { who: 'Sara Mansour', item: 'Logitech Rally Camera Kit', days: 2 }, { who: 'Vikram Rao', item: 'iPad Pro 12.9"', days: 1 }]);

  protected readonly filtered = computed(() => this.store.assets().filter((a) => (this.cat() === 'All' || a.category === this.cat()) && a.name.toLowerCase().includes(this.q().toLowerCase())));
  protected readonly sel = computed(() => this.store.assets().find((a) => a.id === this.selId()) ?? null);
  protected readonly mine = computed(() => this.store.mine().filter((b) => b.kind === 'Asset'));
  protected readonly tot = computed(() => {
    const l = this.store.assets();
    const total = l.reduce((s, a) => s + a.total, 0), out = l.reduce((s, a) => s + a.out, 0), res = l.reduce((s, a) => s + a.reservedToday, 0);
    return { total, out, res, avail: total - out - res, svc: l.filter((a) => a.condition === 'Needs Service').length };
  });
  protected free(a: Asset) {
    return Math.max(0, a.total - a.out - a.reservedToday);
  }
  protected pct(n: number) {
    return Math.round((n / this.tot().total) * 100) + '%';
  }
  protected reserve(a: Asset) {
    const n = Math.min(this.qty(), this.free(a));
    const to = this.ret() === 'Same day' ? '06:00 PM' : this.ret() === 'Next day' ? fmtD(addDays(this.date(), 1)) : fmtD(addDays(this.date(), 3));
    const b = this.store.bookAsset(a, this.date(), '09:00 AM', to, n);
    this.ts.show(b.status === 'Pending' ? `${a.name} requested · awaiting approval` : `${n} × ${a.name} reserved · collect at Equipment Store`);
  }
  protected pickup(b: Booking) {
    this.store.checkIn(b.id);
    this.store.assets.update((l) => l.map((a) => (a.id === b.resourceId ? { ...a, out: a.out + 1, reservedToday: Math.max(0, a.reservedToday - 1) } : a)));
    this.ts.show(`${b.resource} picked up`);
  }
  protected returnIt(b: Booking) {
    this.store.updateBooking(b.id, { status: 'Cancelled' });
    this.store.assets.update((l) => l.map((a) => (a.id === b.resourceId ? { ...a, out: Math.max(0, a.out - 1) } : a)));
    this.ts.show(`${b.resource} returned · thank you`);
  }
  protected service(a: Asset) {
    const q = this.store.addRequest({ title: `Service ${a.name}`, category: 'IT & AV', priority: 'Medium', kind: 'Maintenance', woType: 'Corrective', asset: a.name, site: a.site, location: `${a.site} - Equipment Store`, assignee: 'IT Service Desk', status: 'Assigned' });
    this.ts.show(`${q.id} created for ${a.name}`);
  }
  protected remind(who: string) {
    this.reminded.update((s) => new Set(s).add(who));
    this.ts.show(`Reminder sent to ${who}`);
  }
  protected exportCsv() {
    downloadCsv('equipment-inventory.csv', [['ID', 'Name', 'Category', 'Site', 'Total', 'Checked out', 'Reserved today', 'Available', 'Condition'], ...this.store.assets().map((a) => [a.id, a.name, a.category, a.site, a.total, a.out, a.reservedToday, this.free(a), a.condition])]);
  }
}

/* =====================================================================
   Space Utilization — heatmap, zones, live floor occupancy, recommendations
   ===================================================================== */
@Component({
  selector: 'app-space-utilization',
  imports: [...UI, WKpi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Space Utilization" [parent]="parent" parentLink="/workplace-facility-services" subtitle="Understand how desks, rooms and zones are used to right-size your workplace.">
      <select class="select" [value]="range()" (change)="range.set($any($event.target).value)"><option>Last 4 Weeks</option><option>Last 12 Weeks</option></select>
      <button class="btn-ghost hb" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpis">
      <app-wkpi label="Avg Utilization" value="76%" icon="w-bars" color="var(--ka-7c3aed)" strong="8%" arrow="up" sub="vs. last period" />
      <app-wkpi label="Live Occupancy" [value]="live() + '%'" icon="activity" color="var(--ka-2563eb)" [sub]="busy() + ' of ' + store.deskCounts().total + ' desks'" />
      <app-wkpi label="Peak Occupancy" value="92%" icon="trending-up" color="var(--ka-ef3b4f)" sub="Open Workspace" />
      <app-wkpi label="No-show Rate" value="8.4%" icon="calendar-x" color="var(--ka-f5a524)" strong="1.2%" arrow="down" sub="vs. last period" />
      <app-wkpi label="Underutilized Spaces" [value]="under().length" icon="w-room" color="var(--ka-16c26b)" sub="below 60% use" />
    </section>
    <section class="wl">
      <div class="card">
        <div class="ch"><h3>Occupancy Heatmap · Head Office</h3><div class="seg">@for (d of days; track d) {<button [class.on]="day() === d" (click)="day.set(d)">{{ d }}</button>}</div></div>
        <app-heatmap [rows]="floorNames" [cols]="hoursCols" [data]="heat()" />
      </div>
      <div class="card">
        <div class="ch"><h3>Utilization by Zone</h3></div>
        @for (z of zones; track z.label) {<div class="zr"><span>{{ z.label }}</span><div class="bar"><i [style.width.%]="z.value" [style.background]="zc(z.value)"></i></div><b>{{ z.value }}%</b></div>}
        <div class="zl"><span><i style="background:var(--kb-ef4444)"></i>Over 85%</span><span><i style="background:var(--kb-f59e0b)"></i>60–85%</span><span><i style="background:var(--kb-3b82f6)"></i>40–60%</span><span><i style="background:var(--kb-22c55e)"></i>Under 40%</span></div>
      </div>
    </section>
    <section class="wl even">
      <div class="card">
        <div class="ch"><h3>Utilization Trend</h3><span class="muted sm">weekly average vs. 80% target</span></div>
        <app-line-chart [labels]="trend().labels" [series]="trend().series" [height]="230" suffix="%" />
      </div>
      <div class="card">
        <div class="ch"><h3>Live Desk Occupancy by Floor</h3><select class="select sm" [value]="site()" (change)="site.set($any($event.target).value)">@for (s of sites; track s) {<option>{{ s }}</option>}</select></div>
        <app-bar-list [rows]="byFloor()" />
        <p class="muted sm">Based on occupied + reserved desks right now. Bookings on the Desk Booking page update this instantly.</p>
      </div>
    </section>
    <section class="wl">
      <div class="card">
        <div class="ch"><h3>Space Performance</h3></div>
        <table class="table">
          <thead><tr><th>Space</th><th class="num">Capacity</th><th class="num">Avg Util.</th><th class="num">Peak</th><th class="num">No-shows</th><th>Trend</th><th>Status</th></tr></thead>
          <tbody>
            @for (s of spaces; track s.name) {
              <tr><td><b>{{ s.name }}</b><div class="muted">{{ s.loc }}</div></td><td class="num">{{ s.cap }}</td><td class="num">{{ s.avg }}%</td><td class="num">{{ s.peak }}%</td><td class="num">{{ s.ns }}%</td>
                <td style="width:110px"><app-sparkline [values]="s.trend" [color]="zc(s.avg)" /></td>
                <td><span [class]="s.avg >= 85 ? 'tag red' : s.avg < 40 ? 'tag amber' : 'tag green'">{{ s.avg >= 85 ? 'Over capacity' : s.avg < 40 ? 'Underused' : 'Healthy' }}</span></td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="ch"><h3>Recommendations</h3><span class="tag">AI</span></div>
        <div class="rows">
          @for (r of recs(); track r.id) {
            <div class="row rec"><span class="ic soft" [style.--c]="r.color"><app-icon [name]="r.icon" [size]="16" /></span><span class="nm"><b>{{ r.title }}</b><small class="wrap">{{ r.text }}</small></span>
              @if (r.done) {<span class="tag green">Applied</span>} @else {<button class="btn-ghost sm" (click)="apply(r.id)">Apply</button>}</div>
          }
        </div>
      </div>
    </section>
    @if (ts.t()) {<div class="g-toast">{{ ts.t() }}</div>}
  `,
  styles: [WP_CSS, `
    .zr { display: grid; grid-template-columns: 140px 1fr 40px; gap: 10px; align-items: center; padding: 7px 0; font-size: 12.5px; } .zr .bar { height: 12px; border-radius: 3px; } .zr b { text-align: right; font-weight: 500; }
    .zl { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11px; margin-top: 10px; color: var(--kf-52525b); } .zl span { display: inline-flex; gap: 5px; align-items: center; } .zl i { width: 10px; height: 10px; border-radius: 2px; }
    .rec .wrap { white-space: normal !important; }
  `],
})
export class SpaceUtilization {
  protected readonly store = inject(WorkplaceStore);
  protected readonly parent = 'Workplace & Facility Services';
  protected readonly zc = zoneColor;
  protected readonly sites = WP_SITES;
  protected readonly zones = TOP_ZONES;
  protected readonly ts = toast();
  protected readonly days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  protected readonly day = signal('Wed');
  protected readonly range = signal('Last 4 Weeks');
  protected readonly site = signal('Head Office');
  protected readonly floorNames = ['Floor 8', 'Floor 7', 'Floor 6', 'Floor 5', 'Floor 4', 'Floor 3', 'Floor 2', 'Floor 1'];
  protected readonly hoursCols = UTIL_HOURS;
  protected readonly heat = computed(() => {
    const k = this.days.indexOf(this.day());
    const f = [0.82, 1.05, 1, 0.96, 0.7][k];
    return FLOOR_HEAT.map((r, ri) => r.map((v, ci) => Math.max(4, Math.min(99, Math.round(v * f + ((ri + ci + k) % 3) - 1)))));
  });
  protected readonly busy = computed(() => this.store.deskCounts().occupied + this.store.deskCounts().reserved);
  protected readonly live = computed(() => Math.round((this.busy() / this.store.deskCounts().total) * 100));
  protected readonly trend = computed(() => {
    const n = this.range() === 'Last 4 Weeks' ? 4 : 12;
    const all = [61, 63, 66, 64, 68, 70, 69, 72, 71, 74, 70, 76];
    const labels = Array.from({ length: n }, (_, i) => `W${41 - n + i + 1}`);
    return { labels, series: [{ name: 'Utilization', color: 'var(--ka-7c3aed)', values: all.slice(12 - n), area: true }, { name: 'Target', color: 'var(--ka-ef4444)', values: labels.map(() => 80), dashed: true }] };
  });
  protected readonly byFloor = computed(() => FLOORS[this.site()].filter((f) => f.desks).map((f) => {
    const d = this.store.desks().filter((x) => x.site === this.site() && x.floor === f.name);
    const v = Math.round((d.filter((x) => x.status === 'occupied' || x.status === 'reserved').length / d.length) * 100);
    return { label: f.name, value: v, display: `${v}%`, color: zoneColor(v) };
  }));
  protected readonly spaces = [
    { name: 'Open Workspace', loc: 'Head Office · Floors 1–8', cap: 96, avg: 92, peak: 100, ns: 6.1, trend: [80, 84, 86, 88, 90, 92] },
    { name: 'Collaboration Area', loc: 'Head Office · Floors 1–8', cap: 24, avg: 78, peak: 96, ns: 4.2, trend: [70, 72, 75, 74, 77, 78] },
    { name: 'Team Area', loc: 'All sites', cap: 72, avg: 68, peak: 88, ns: 9.8, trend: [62, 66, 64, 69, 67, 68] },
    { name: 'Focus Zone', loc: 'All sites', cap: 88, avg: 54, peak: 79, ns: 11.3, trend: [58, 57, 55, 56, 53, 54] },
    { name: 'Quiet Zone', loc: 'Head Office, Tech Park', cap: 80, avg: 46, peak: 70, ns: 12.6, trend: [52, 50, 49, 47, 48, 46] },
    { name: 'Executive Area', loc: 'Head Office · Floor 8', cap: 12, avg: 32, peak: 58, ns: 14.0, trend: [40, 38, 36, 35, 33, 32] },
  ];
  protected readonly under = computed(() => this.spaces.filter((s) => s.avg < 60));
  protected readonly recs = signal([
    { id: 1, icon: 'w-desk', color: 'var(--ka-7c3aed)', title: 'Convert 12 Quiet Zone desks to hot desks', text: 'Quiet Zone averages 46% while Open Workspace peaks at 100% on Tue–Thu.', done: false },
    { id: 2, icon: 'calendar-x', color: 'var(--ka-f59e0b)', title: 'Auto-release no-show bookings after 30 min', text: '8.4% of desk bookings are never checked in; reclaiming them frees ~35 desks a day.', done: false },
    { id: 3, icon: 'w-room', color: 'var(--ka-3b82f6)', title: 'Open Executive Area for team bookings on Fridays', text: 'Executive Area is under 35% on Fridays; offer it to project teams.', done: false },
    { id: 4, icon: 'sun', color: 'var(--ka-16a34a)', title: 'Reduce HVAC on Floor 8 after 4 PM', text: 'Floor 8 drops below 25% after 4 PM — estimated 6% energy saving.', done: false },
  ]);
  protected apply(id: number) {
    this.recs.update((l) => l.map((r) => (r.id === id ? { ...r, done: true } : r)));
    this.ts.show('Recommendation applied · change scheduled from next Monday');
  }
  protected exportCsv() {
    downloadCsv('space-utilization.csv', [['Floor', ...UTIL_HOURS], ...this.heat().map((r, i) => [this.floorNames[i], ...r])]);
  }
}
