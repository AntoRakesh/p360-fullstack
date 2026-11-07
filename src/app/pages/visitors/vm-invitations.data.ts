// Data + store for the "Visit Invitations & Pre-Registration" page (agent g).
import { Injectable, computed, signal } from '@angular/core';
import { dayLabel } from './vm-a-kit';

export const INV_BASE = new Date(2026, 9, 15); // Wed, 15 Oct 2026
export const DEPARTMENTS = ['Corporate Affairs', 'Business Development', 'Human Resources', 'Logistics', 'Plant Operations', 'Facilities', 'IT', 'Finance', 'Compliance'];
export const DURATIONS = [30, 60, 90, 120, 180, 240, 480];
export const VALIDITY = ['Valid for 1 day', 'Valid for 3 days', 'Valid for 7 days', 'Valid for 14 days', 'Valid for 30 days'];
export type InvStatus = 'Draft' | 'Sent' | 'Opened' | 'Confirmed' | 'Expired' | 'Cancelled';
export type Delivery = 'Email' | 'SMS' | 'Email + SMS';

export interface Invitation {
  id: string;
  visitor: string;
  email: string;
  mobile: string;
  company: string;
  purpose: string;
  host: string;
  dept: string;
  site: string;
  /** day offset from INV_BASE */
  day: number;
  time: number;
  duration: number;
  count: number;
  areas: string[];
  vehicle: string;
  parking: boolean;
  nda: boolean;
  safety: boolean;
  validity: string;
  delivery: Delivery;
  message: string;
  status: InvStatus;
  sentOn: string;
  /** shown in the Visit Date column instead of the date (e.g. "Today") */
  dateLabel?: string;
}

export const durLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60} hour${m > 60 ? 's' : ''}`);
export const invDay = (o: number) => dayLabel(INV_BASE, o);
export const defaultMessage = (host: string) =>
  `You are invited to visit People360. Please complete your pre-registration before your arrival to help us provide a smooth and secure experience.`;

let n = 1040;
const I = (visitor: string, company: string, purpose: string, host: string, site: string, day: number, status: InvStatus, sentOn: string, extra: Partial<Invitation> = {}): Invitation => ({
  id: `INV-${n--}`, visitor, company, purpose, host, site, day, status, sentOn,
  email: `${visitor.toLowerCase().replace(/[^a-z]+/g, '.')}@${company.toLowerCase().replace(/[^a-z]/g, '')}.com`,
  mobile: '+91 98765 43210', dept: 'Corporate Affairs', time: 630, duration: 60, count: 1, areas: ['Reception', 'Meeting Rooms'],
  vehicle: '', parking: false, nda: false, safety: true, validity: 'Valid for 7 days', delivery: 'Email', message: defaultMessage(host),
  ...extra,
});

const SEED: Invitation[] = [
  I('Arjun Mehta', 'Tech Solutions', 'Business Meeting', 'Priya Sharma', 'Main Campus – Tower A', 0, 'Opened', 'Wed, 08 Oct 2026, 02:14 PM', { email: 'arjun.mehta@techsolutions.com', vehicle: 'MH12AB1234', parking: true }),
  I('Maria Santos', 'Global IT', 'Interview', 'Li Wei', 'Main Campus – Tower A', 1, 'Confirmed', 'Tue, 07 Oct 2026, 11:20 AM', { dept: 'Human Resources', time: 870, duration: 90, mobile: '+91 98111 40221' }),
  I('David Lee', 'ABC Contractors', 'Site Visit', 'Ramesh Kumar', 'Plant Site – North Block', 1, 'Sent', 'Tue, 07 Oct 2026, 04:05 PM', { dept: 'Plant Operations', time: 600, duration: 180, nda: true, areas: ['Main Entrance', 'Plant Floor'], delivery: 'Email + SMS' }),
  I('Sarah Khan', 'Gulf Logistics', 'Delivery', 'Ahmed Hassan', 'Main Campus – Tower B', 0, 'Expired', 'Mon, 06 Oct 2026, 09:32 AM', { dateLabel: 'Today', dept: 'Logistics', time: 840, duration: 30, delivery: 'SMS', validity: 'Valid for 1 day' }),
  I('Rohan Verma', 'Vertex Systems', 'Project Discussion', 'Michael Chen', 'Main Campus – Tower A', 2, 'Sent', 'Tue, 14 Oct 2026, 05:48 PM', { dept: 'IT', time: 660, duration: 120 }),
  I('Aisha Noor', 'PwC', 'Audit', 'Maria Santos', 'Main Campus – Tower A', 3, 'Confirmed', 'Mon, 13 Oct 2026, 10:02 AM', { dept: 'Compliance', time: 540, duration: 480, count: 3, nda: true }),
  I('Emily Clark', 'Global Ventures', 'Executive Meeting', 'Rex Kumar', 'Executive Entrance – Tower A', 0, 'Confirmed', 'Fri, 10 Oct 2026, 03:30 PM', { dept: 'Corporate Affairs', time: 900, duration: 90, areas: ['Reception', 'Executive Floor', 'Boardroom'], parking: true, vehicle: 'KA05MN7788' }),
  I('Karan Malik', 'Facility Services', 'Maintenance', 'Fatima Ali', 'Main Campus – Tower C', 4, 'Opened', 'Tue, 14 Oct 2026, 09:15 AM', { dept: 'Facilities', time: 480, duration: 240, safety: true }),
  I('Neha Gupta', 'Infosys', 'Training', 'Priya Sharma', 'Main Campus – Tower A', 6, 'Sent', 'Wed, 15 Oct 2026, 08:40 AM', { dept: 'Business Development', time: 600, duration: 240, count: 4 }),
  I('Tom Wong', 'SecureTech', 'Business Meeting', 'Ahmed Hassan', 'Main Campus – Tower B', -2, 'Expired', 'Thu, 02 Oct 2026, 01:12 PM', { dept: 'Logistics' }),
];

@Injectable({ providedIn: 'root' })
export class InvitationStore {
  readonly list = signal<Invitation[]>(SEED);
  private seq = 1041;
  /** Baselines so tiles read 18 / 7 / 32 / 4 like the reference while reacting to changes. */
  private readonly base = {
    active: 18 - SEED.filter((i) => isActive(i)).length,
    awaiting: 7 - SEED.filter(isAwaiting).length,
    confirmed: 32 - SEED.filter((i) => i.status === 'Confirmed').length,
    expired: 4 - SEED.filter((i) => i.status === 'Expired').length,
  };
  readonly kpi = computed(() => {
    const l = this.list();
    return {
      active: this.base.active + l.filter(isActive).length,
      awaiting: this.base.awaiting + l.filter(isAwaiting).length,
      confirmed: this.base.confirmed + l.filter((i) => i.status === 'Confirmed').length,
      expired: this.base.expired + l.filter((i) => i.status === 'Expired').length,
    };
  });
  nextId() { return `INV-${this.seq++}`; }
  byId(id: string) { return this.list().find((i) => i.id === id) ?? null; }
  upsert(i: Invitation) { this.list.update((l) => (l.some((x) => x.id === i.id) ? l.map((x) => (x.id === i.id ? i : x)) : [i, ...l])); }
  patch(id: string, c: Partial<Invitation>) { this.list.update((l) => l.map((i) => (i.id === id ? { ...i, ...c } : i))); }
  remove(id: string) { this.list.update((l) => l.filter((i) => i.id !== id)); }
}
export const isAwaiting = (i: Invitation) => i.status === 'Sent' || i.status === 'Opened';
export const isActive = (i: Invitation) => isAwaiting(i) || i.status === 'Confirmed';
