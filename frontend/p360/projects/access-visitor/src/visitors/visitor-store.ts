import { Injectable, computed, signal } from '@angular/core';
import { rng } from '@p360/shared/data/demo-data';
import { hostDept, makeVisit, TODAY_VISITS, VEHICLES, Vehicle, Visit, VStatus, WATCHLIST, WatchEntry } from './visitors.data';

export interface NewVisitor {
  name: string;
  company: string;
  email?: string;
  phone?: string;
  purpose: string;
  host: string;
  expected?: number;
  vehicle?: string;
  method: string;
}

/** Shared in-memory visitor state so every Visitor Management page stays in sync. */
@Injectable({ providedIn: 'root' })
export class VisitorStore {
  readonly visits = signal<Visit[]>(TODAY_VISITS.map((v) => ({ ...v })));
  readonly vehicles = signal<Vehicle[]>(VEHICLES.map((v) => ({ ...v })));
  readonly watchlist = signal<WatchEntry[]>(WATCHLIST.map((w) => ({ ...w })));
  private seq = 500;

  readonly onSite = computed(() => this.visits().filter((v) => v.status === 'Checked In'));
  readonly counts = computed(() => {
    const c: Record<string, number> = {};
    for (const v of this.visits()) c[v.status] = (c[v.status] ?? 0) + 1;
    return c;
  });

  private patch(id: string, c: Partial<Visit>) {
    this.visits.update((l) => l.map((v) => (v.id === id ? { ...v, ...c } : v)));
  }
  checkIn(id: string) {
    this.patch(id, { status: 'Checked In', checkIn: Date.now(), badge: `VB-${4000 + this.seq++}` });
  }
  checkOut(id: string) {
    this.patch(id, { status: 'Checked Out', checkOut: Date.now() });
  }
  approve(id: string) {
    this.patch(id, { status: 'Expected' });
  }
  reject(id: string) {
    this.patch(id, { status: 'Rejected' });
  }
  setStatus(id: string, status: VStatus) {
    this.patch(id, { status });
  }
  /** Adds a visit; walk-ins are checked in immediately. Returns the new visit. */
  add(n: NewVisitor, status: VStatus): Visit {
    const r = rng(this.seq * 7);
    const v = makeVisit(900 + this.seq++, n.name, n.company, n.purpose, n.host, status, n.expected ?? Date.now(), r, n.method);
    const visit: Visit = {
      ...v,
      email: n.email || v.email,
      phone: n.phone || v.phone,
      hostDept: hostDept(n.host),
      vehicle: n.vehicle ?? '',
      checkIn: status === 'Checked In' ? Date.now() : null,
      checkOut: null,
      badge: status === 'Checked In' ? `VB-${4000 + this.seq}` : '',
    };
    this.visits.update((l) => [visit, ...l]);
    return visit;
  }
  /** Simple name screening against the watchlist (case-insensitive, first+last name). */
  screen(name: string): WatchEntry | null {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    return this.watchlist().find((w) => w.name.toLowerCase() === n || (n.split(' ').length > 1 && w.name.toLowerCase().includes(n))) ?? null;
  }
}
