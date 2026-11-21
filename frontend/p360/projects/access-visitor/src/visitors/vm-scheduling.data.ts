// Seed data + root store for Visit Scheduling (vm-scheduling.ts). Events are dated relative to "today" (AppState.date).
import { Injectable, inject, signal } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { HOSTS, PURPOSES, SITES } from './vm.data';

export type SchedStatus = 'Confirmed' | 'Pending Confirmation' | 'Rescheduled' | 'Cancelled' | 'Draft' | 'Completed';
export const SCHED_STATUSES: SchedStatus[] = ['Confirmed', 'Pending Confirmation', 'Rescheduled', 'Draft', 'Completed', 'Cancelled'];

export interface SchedVisit {
  id: number;
  visitor: string;
  contact: string;
  company: string;
  purpose: string;
  host: string;
  site: string;
  /** YYYY-MM-DD (local) */
  date: string;
  /** minutes since midnight */
  start: number;
  end: number;
  status: SchedStatus;
  recurring?: boolean;
  invite?: boolean;
  /** listed in the "Upcoming Visits" table in seed order */
  pinned?: boolean;
}

/** Colour + icon per visit purpose (calendar blocks, table purpose column). */
export const PURPOSE_STYLE: Record<string, { c: string; icon: string }> = {
  'Business Meeting': { c: 'var(--ka-7c3aed)', icon: 'w-calendar' },
  'Site Visit': { c: 'var(--ka-16a34a)', icon: 'map-pin' },
  Delivery: { c: 'var(--ka-ea580c)', icon: 'truck' },
  Interview: { c: 'var(--ka-2563eb)', icon: 'users' },
  Maintenance: { c: 'var(--ka-dc2626)', icon: 'tasks-wrench' },
  'Project Discussion': { c: 'var(--ka-0d9488)', icon: 'message' },
  'Executive Meeting': { c: 'var(--ka-9333ea)', icon: 'star' },
  Training: { c: 'var(--ka-ca8a04)', icon: 'graduation-cap' },
  Audit: { c: 'var(--ka-475569)', icon: 'file-check' },
};
export const purposeStyle = (p: string) => PURPOSE_STYLE[p] ?? { c: 'var(--ka-7c3aed)', icon: 'w-calendar' };

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parseIso(s); d.setDate(d.getDate() + n); return isoDate(d); };
/** Monday of the week containing s. */
export const weekStart = (s: string) => { const d = parseIso(s); return addDays(s, -((d.getDay() + 6) % 7)); };

const GUESTS = ['Rohan Verma', 'Aisha Noor', 'Vikram Iyer', 'Neha Gupta', 'Karan Malik', 'Emily Clark', 'Omar Yusuf', 'Grace Park', 'Daniel Brown', 'Sanjay Nair', 'Layla Hassan', 'Tom Wong'];
const GCOS = ['Vertex Systems', 'Purple Holdings', 'Global Ventures', 'Siemens', 'PwC', 'DHL', 'Infosys', 'Blue Dart'];

@Injectable({ providedIn: 'root' })
export class VisitScheduleStore {
  private readonly app = inject(AppState);
  readonly today = isoDate(this.app.date());
  private seq = 1;
  readonly visits = signal<SchedVisit[]>(this.seed());
  /** Seed counts the KPI tiles are anchored to (image: 46 today / 128 this week / 14 pending). */
  readonly base = { today: this.count((v) => v.date === this.today), week: this.count((v) => weekStart(v.date) === weekStart(this.today)), pending: this.count((v) => v.status === 'Pending Confirmation') };

  private count(f: (v: SchedVisit) => boolean) { return this.visits().filter((v) => v.status !== 'Cancelled' && f(v)).length; }
  nextId() { return this.seq++; }

  private seed(): SchedVisit[] {
    const t = this.today;
    const mk = (v: Omit<SchedVisit, 'id'>): SchedVisit => ({ id: this.seq++, ...v });
    const cast: SchedVisit[] = [
      mk({ visitor: 'Arjun Mehta', contact: 'arjun.mehta@techsolutions.com', company: 'Tech Solutions', purpose: 'Business Meeting', host: 'Priya Sharma', site: SITES[0], date: t, start: 630, end: 720, status: 'Confirmed', invite: true, pinned: true }),
      mk({ visitor: 'Maria Santos', contact: 'maria.santos@globalit.com', company: 'Global IT', purpose: 'Interview', host: 'Li Wei', site: SITES[0], date: addDays(t, 1), start: 870, end: 960, status: 'Pending Confirmation', invite: true, pinned: true }),
      mk({ visitor: 'David Lee', contact: 'david.lee@abccontractors.com', company: 'ABC Contractors', purpose: 'Site Visit', host: 'Ramesh Kumar', site: SITES[3], date: addDays(t, 1), start: 600, end: 690, status: 'Confirmed', invite: true, pinned: true }),
      mk({ visitor: 'Sarah Khan', contact: '+971 50 442 1180', company: 'Gulf Logistics', purpose: 'Delivery', host: 'Ahmed Hassan', site: SITES[1], date: t, start: 840, end: 900, status: 'Rescheduled', invite: true, pinned: true }),
      mk({ visitor: 'Chen Wei', contact: 'chen.wei@facilityservices.com', company: 'Facility Services', purpose: 'Maintenance', host: 'Fatima Ali', site: SITES[2], date: addDays(t, 2), start: 540, end: 630, status: 'Confirmed', invite: true, pinned: true }),
      mk({ visitor: 'David Lee', contact: 'david.lee@abccontractors.com', company: 'ABC Contractors', purpose: 'Site Visit', host: 'Ramesh Kumar', site: SITES[3], date: addDays(t, -1), start: 600, end: 690, status: 'Completed', invite: true }),
    ];
    // Background visits on other weeks so Month / Agenda views have content (current week stays as in the image).
    const ws = weekStart(t);
    const out = [...cast];
    let r = 17;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let off = -35; off <= 42; off++) {
      const d = addDays(ws, off);
      if (off >= 0 && off < 7) continue;
      const dow = (parseIso(d).getDay() + 6) % 7;
      const n = dow >= 5 ? (rnd() < 0.3 ? 1 : 0) : 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const start = 540 + Math.floor(rnd() * 14) * 30;
        const host = HOSTS[Math.floor(rnd() * 6)];
        const g = GUESTS[Math.floor(rnd() * GUESTS.length)];
        const co = GCOS[Math.floor(rnd() * GCOS.length)];
        out.push(mk({
          visitor: g, contact: `${g.toLowerCase().replace(' ', '.')}@${co.toLowerCase().replace(/[^a-z]/g, '')}.com`, company: co,
          purpose: PURPOSES[Math.floor(rnd() * 6)], host: host.name, site: host.site, date: d, start, end: Math.min(1080, start + 60 + Math.floor(rnd() * 3) * 30),
          status: d < t ? 'Completed' : rnd() < 0.2 ? 'Pending Confirmation' : 'Confirmed', invite: true,
        }));
      }
    }
    return out;
  }
}
