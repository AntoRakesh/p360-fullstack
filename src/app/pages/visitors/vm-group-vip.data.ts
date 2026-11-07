// Seed data + root store for Group / VIP Visits (vm-group-vip.ts).
import { Injectable, signal } from '@angular/core';

export type GroupStatus = 'In Progress' | 'Upcoming' | 'Completed' | 'Cancelled';
export interface Guest { name: string; company: string; in: boolean }
export interface VipBrief { name: string; org: string; purpose: string; protocol: { label: string; done: boolean }[] }
export interface GroupVisit {
  id: number;
  name: string;
  type: 'VIP' | 'Group';
  org: string;
  host: string;
  site: string;
  /** day offset from today */
  day: number;
  start: number;
  end: number;
  access: 'Executive' | 'Standard' | 'Restricted';
  areas: string[];
  badge: string;
  transport: boolean;
  status: GroupStatus;
  guests: Guest[];
  vip?: VipBrief;
  file?: string;
}

export const GV_SITES = ['Main Campus – Tower A', 'Main Campus – Tower B', 'Main Campus – Tower C', 'Plant Site – North Block', 'Executive Entrance'];
export const GV_AREAS = ['Executive Floor', 'Boardroom', 'Visitor Lounge', 'Meeting Rooms', 'Cafeteria', 'Plant Floor', 'Training Room', 'Parking Gate'];
export const GV_BADGES = ['Executive Visitor', 'Visitor Badge (Day Pass)', 'Contractor Badge', 'Site Visit Badge', 'Group Escort Badge'];

const FIRST = ['Rohan', 'Aisha', 'Vikram', 'Neha', 'Karan', 'Meera', 'Omar', 'Hana', 'Rahul', 'Sara', 'Imran', 'Emily', 'Tom', 'Nadia', 'Yusuf', 'Olivia', 'Sanjay', 'Layla', 'Daniel', 'Grace', 'Faisal', 'Anil', 'Zara', 'Ken', 'Priya', 'James', 'Leo', 'Mina'];
const LAST = ['Verma', 'Noor', 'Iyer', 'Gupta', 'Malik', 'Clark', 'Yusuf', 'Brown', 'Nair', 'Ahmed', 'Kapoor', 'Wong', 'Patel', 'Karim', 'Singh', 'Das', 'Tanaka', 'Fischer'];
export function makeGuests(n: number, org: string, checked: number, seed: number, lead?: string): Guest[] {
  let r = seed * 7919 + 13;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => ({
    name: i === 0 && lead ? lead : `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`,
    company: org,
    in: i < checked,
  }));
}
const PROTO = (done = [true, true, true, true]) => ['Dedicated host', 'Private waiting area', 'Security notified', 'Refreshments arranged'].map((label, i) => ({ label, done: done[i] }));

@Injectable({ providedIn: 'root' })
export class GroupVisitStore {
  private seq = 6;
  nextId() { return this.seq++; }
  readonly groups = signal<GroupVisit[]>([
    { id: 1, name: 'Global Tech Leadership Delegation', type: 'VIP', org: 'Tech Solutions', host: 'Priya Sharma', site: GV_SITES[0], day: 0, start: 630, end: 750, access: 'Executive', areas: ['Executive Floor', 'Boardroom', 'Visitor Lounge'], badge: 'Executive Visitor', transport: true, status: 'In Progress',
      guests: makeGuests(18, 'Tech Solutions', 12, 1, 'Hiroshi Tanaka'), vip: { name: 'Hiroshi Tanaka', org: 'Tech Solutions', purpose: 'Leadership Delegation', protocol: PROTO() } },
    { id: 2, name: 'Board of Directors Visit', type: 'VIP', org: 'Purple Holdings', host: 'Rex Kumar', site: GV_SITES[4], day: 0, start: 780, end: 900, access: 'Executive', areas: ['Executive Floor', 'Boardroom', 'Visitor Lounge'], badge: 'Executive Visitor', transport: true, status: 'Upcoming',
      guests: makeGuests(6, 'Purple Holdings', 0, 2, 'Dr. Anika Rao'), vip: { name: 'Dr. Anika Rao', org: 'Global Ventures', purpose: 'Executive Meeting', protocol: PROTO() } },
    { id: 3, name: 'ABC Contractors Site Induction', type: 'Group', org: 'ABC Contractors', host: 'Ramesh Kumar', site: GV_SITES[3], day: 0, start: 840, end: 960, access: 'Standard', areas: ['Plant Floor', 'Training Room'], badge: 'Contractor Badge', transport: false, status: 'Upcoming',
      guests: makeGuests(24, 'ABC Contractors', 0, 3) },
    { id: 4, name: 'Campus Facilities Upgrade Team', type: 'Group', org: 'Facility Services', host: 'Ahmed Hassan', site: GV_SITES[1], day: 0, start: 540, end: 660, access: 'Standard', areas: ['Meeting Rooms', 'Cafeteria'], badge: 'Visitor Badge (Day Pass)', transport: false, status: 'Completed',
      guests: makeGuests(12, 'Facility Services', 12, 4) },
    { id: 5, name: 'Regulatory Audit Team', type: 'VIP', org: 'Ministry of Commerce', host: 'Maria Santos', site: GV_SITES[0], day: 1, start: 600, end: 780, access: 'Restricted', areas: ['Boardroom', 'Meeting Rooms'], badge: 'Executive Visitor', transport: true, status: 'Cancelled',
      guests: makeGuests(8, 'Ministry of Commerce', 0, 5, 'Helen Ford'), vip: { name: 'Helen Ford', org: 'Ministry of Commerce', purpose: 'Regulatory Audit', protocol: PROTO([true, false, true, false]) } },
  ]);
}
