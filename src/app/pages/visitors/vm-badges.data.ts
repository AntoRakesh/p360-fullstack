// Hard-coded dataset + root store for Visitor Badges & Printing (reference image: 15 Oct 2026, 10:24 AM).
import { Injectable, computed, signal } from '@angular/core';

export type QStatus = 'Awaiting Print' | 'Printing' | 'Printed' | 'Issued' | 'Returned' | 'Lost';
export type AStatus = 'Active' | 'Returned' | 'Lost' | 'Expired';
export interface QueueRow { id: string; name: string; company: string; companyFull: string; type: string; host: string; site: string; at: number; status: QStatus; badgeNo: string; areas: string[]; validFrom: number; validTo: number; template: string }
export interface ActRow { id: string; name: string; badgeNo: string; type: string; by: string; issued: string; returned: string; status: AStatus }
export interface BadgeTpl { id: string; name: string; desc: string; band: string; color: string; type: string; photo: boolean; qr: boolean; host: boolean; expiry: number }

export const BADGE_TYPE_LIST = ['Visitor Day Pass', 'Contractor Badge', 'Site Visit Badge', 'Delivery Badge', 'Executive Visitor'];
export const PRINTERS = [
  { name: 'Reception Printer 01', status: 'Ready' },
  { name: 'Reception Printer 02', status: 'Ready' },
  { name: 'Security Desk Printer', status: 'Low Ribbon' },
  { name: 'Tower B Lobby Printer', status: 'Offline' },
];

export const TEMPLATES: BadgeTpl[] = [
  { id: 'T1', name: 'Visitor Day Pass', desc: 'Standard visitor badge for general office visits.', band: 'VISITOR', color: '#6d28d9', type: 'Visitor Day Pass', photo: true, qr: true, host: true, expiry: 1 },
  { id: 'T2', name: 'Contractor Badge', desc: 'For contractors and on-site service providers.', band: 'CONTRACTOR', color: '#ea580c', type: 'Contractor Badge', photo: true, qr: true, host: true, expiry: 7 },
  { id: 'T3', name: 'Delivery Badge', desc: 'For deliveries, pickups, and logistics personnel.', band: 'DELIVERY', color: '#16a34a', type: 'Delivery Badge', photo: true, qr: true, host: false, expiry: 1 },
];
export const tplFor = (type: string, l: BadgeTpl[]) => l.find((t) => t.type === type) ?? (type === 'Site Visit Badge' ? l.find((t) => t.id === 'T2') : null) ?? l[0];

const Q: QueueRow[] = [
  { id: 'Q1', name: 'Arjun Mehta', company: 'Tech Solutions', companyFull: 'Tech Solutions Pvt. Ltd.', type: 'Visitor Day Pass', host: 'Priya Sharma', site: 'Main Campus – Tower A', at: 624, status: 'Awaiting Print', badgeNo: 'VIS-000784', areas: ['Main Entrance', 'Meeting Rooms', 'Visitor Lounge'], validFrom: 630, validTo: 750, template: 'T1' },
  { id: 'Q2', name: 'Maria Santos', company: 'Global IT', companyFull: 'Global IT Services', type: 'Contractor Badge', host: 'Li Wei', site: 'Main Campus – Tower A', at: 622, status: 'Printed', badgeNo: 'VIS-000632', areas: ['Main Entrance', 'Meeting Rooms'], validFrom: 870, validTo: 960, template: 'T2' },
  { id: 'Q3', name: 'David Lee', company: 'ABC Contractors', companyFull: 'ABC Contractors LLC', type: 'Site Visit Badge', host: 'Ramesh Kumar', site: 'Plant Site – North Block', at: 618, status: 'Issued', badgeNo: 'VIS-000119', areas: ['Main Entrance', 'Plant Floor'], validFrom: 630, validTo: 780, template: 'T2' },
  { id: 'Q4', name: 'Sarah Khan', company: 'Gulf Logistics', companyFull: 'Gulf Logistics FZE', type: 'Delivery Badge', host: 'Ahmed Hassan', site: 'Main Campus – Tower B', at: 614, status: 'Returned', badgeNo: 'VIS-000103', areas: ['Main Entrance', 'Reception'], validFrom: 600, validTo: 660, template: 'T3' },
  { id: 'Q5', name: 'Chen Wei', company: 'Facility Services', companyFull: 'Facility Services Co.', type: 'Contractor Badge', host: 'Fatima Ali', site: 'Main Campus – Tower C', at: 605, status: 'Awaiting Print', badgeNo: 'VIS-000778', areas: ['Main Entrance', 'Plant Floor'], validFrom: 540, validTo: 660, template: 'T2' },
  { id: 'Q6', name: 'Rohan Verma', company: 'Vertex Systems', companyFull: 'Vertex Systems Ltd.', type: 'Visitor Day Pass', host: 'Michael Chen', site: 'Main Campus – Tower A', at: 598, status: 'Awaiting Print', badgeNo: 'VIS-000771', areas: ['Main Entrance', 'Meeting Rooms'], validFrom: 660, validTo: 780, template: 'T1' },
  { id: 'Q7', name: 'Aisha Noor', company: 'PwC', companyFull: 'PwC India', type: 'Executive Visitor', host: 'Rex Kumar', site: 'Executive Entrance – Tower A', at: 590, status: 'Printed', badgeNo: 'VIS-000769', areas: ['Main Entrance', 'Executive Floor', 'Boardroom'], validFrom: 690, validTo: 810, template: 'T1' },
];
const A: ActRow[] = [
  { id: 'A1', name: 'Arjun Mehta', badgeNo: 'VIS-000784', type: 'Visitor Day Pass', by: 'Priya Sharma', issued: '15 Oct 2026, 10:30 AM', returned: '—', status: 'Active' },
  { id: 'A2', name: 'Maria Santos', badgeNo: 'VIS-000632', type: 'Contractor Badge', by: 'Li Wei', issued: '15 Oct 2026, 02:36 PM', returned: '15 Oct 2026, 05:10 PM', status: 'Returned' },
  { id: 'A3', name: 'David Lee', badgeNo: 'VIS-000119', type: 'Site Visit Badge', by: 'Ramesh Kumar', issued: '15 Oct 2026, 10:08 AM', returned: '—', status: 'Lost' },
  { id: 'A4', name: 'Sarah Khan', badgeNo: 'VIS-000103', type: 'Delivery Badge', by: 'Ahmed Hassan', issued: '14 Oct 2026, 03:20 PM', returned: '—', status: 'Expired' },
  { id: 'A5', name: 'Chen Wei', badgeNo: 'VIS-000778', type: 'Contractor Badge', by: 'Fatima Ali', issued: '15 Oct 2026, 08:15 AM', returned: '—', status: 'Active' },
  { id: 'A6', name: 'Ahmed Raza', badgeNo: 'VIS-000776', type: 'Visitor Day Pass', by: 'Priya Sharma', issued: '15 Oct 2026, 07:40 AM', returned: '15 Oct 2026, 09:35 AM', status: 'Returned' },
];

/** "10:24 AM" with leading zero hours, as printed on badges ("10:30 AM – 12:30 PM"). */
export const t12 = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export const ago = (now: number, at: number) => { const d = now - at; return d <= 1 ? 'Just now' : d < 60 ? `${d} min ago` : `${Math.floor(d / 60)}h ago`; };

@Injectable({ providedIn: 'root' })
export class BadgeStore {
  readonly queue = signal<QueueRow[]>(Q.map((r) => ({ ...r, areas: [...r.areas] })));
  readonly activity = signal<ActRow[]>(A.map((r) => ({ ...r })));
  readonly templates = signal<BadgeTpl[]>(TEMPLATES.map((t) => ({ ...t })));
  /** Offsets added to the reference KPI values by actions on this page. */
  readonly dIssued = signal(0);
  readonly dReturned = signal(0);
  readonly dLost = signal(0);
  private seq = 8;

  readonly kpis = computed(() => ({
    active: 86 + this.dIssued() - this.dReturned() - this.dLost(),
    queue: this.queue().filter((r) => r.status === 'Awaiting Print' || r.status === 'Printing' || r.status === 'Printed').length + 2,
    issued: 42 + this.dIssued(),
    returned: 35 + this.dReturned(),
  }));

  patchQ(id: string, c: Partial<QueueRow>) { this.queue.update((l) => l.map((r) => (r.id === id ? { ...r, ...c } : r))); }
  patchA(id: string, c: Partial<ActRow>) { this.activity.update((l) => l.map((r) => (r.id === id ? { ...r, ...c } : r))); }
  addQ(r: Omit<QueueRow, 'id'>) { const id = `Q${this.seq++}`; this.queue.update((l) => [{ ...r, id }, ...l]); return id; }
  addA(r: Omit<ActRow, 'id'>) { const id = `A${this.seq++}`; this.activity.update((l) => [{ ...r, id }, ...l]); return id; }
}
