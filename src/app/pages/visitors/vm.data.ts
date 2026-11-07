// Core dataset + root store for the redesigned Visitor Management pages.
// Cast/IDs follow the reference images (Arjun Mehta VIS-000784, Maria Santos VIS-000783 …).
// Page-specific data lives in each page's own vm-<page>.data.ts and may read/extend this store.
import { Injectable, computed, signal } from '@angular/core';

export const SITES = ['Main Campus – Tower A', 'Main Campus – Tower B', 'Main Campus – Tower C', 'Plant Site – North Block', 'Executive Entrance – Tower A'];
export const AREAS = ['Main Entrance', 'Reception', 'Meeting Rooms', 'Visitor Lounge', 'Executive Floor', 'Boardroom', 'Cafeteria', 'Parking Gate', 'Plant Floor', 'Server Room'];
export const PURPOSES = ['Business Meeting', 'Delivery', 'Interview', 'Site Visit', 'Maintenance', 'Project Discussion', 'Executive Meeting', 'Training', 'Audit'];
export const VISITOR_TYPES = ['Business Visitor', 'Contractor', 'Delivery', 'Interview Candidate', 'VIP', 'Vendor', 'Government Official'];
export const ID_TYPES = ['Aadhaar', 'Passport', 'National ID', 'Driver License', 'Emirates ID'];
export const BADGE_TYPES = ['Visitor Badge (Day Pass)', 'Contractor Badge', 'Site Visit Badge', 'Delivery Badge', 'Executive Visitor'];
export interface Host { name: string; emp: string; dept: string; site: string; phone: string; available: boolean }
export const HOSTS: Host[] = [
  { name: 'Priya Sharma', emp: 'EMP10023', dept: 'Business Development', site: SITES[0], phone: '+91 98765 43210', available: true },
  { name: 'Ahmed Hassan', emp: 'EMP10041', dept: 'Logistics', site: SITES[1], phone: '+91 98450 22118', available: true },
  { name: 'Ramesh Kumar', emp: 'EMP10057', dept: 'Plant Operations', site: SITES[3], phone: '+91 99020 11873', available: true },
  { name: 'Li Wei', emp: 'EMP10062', dept: 'Human Resources', site: SITES[0], phone: '+91 98111 40291', available: false },
  { name: 'Fatima Ali', emp: 'EMP10078', dept: 'Facilities', site: SITES[2], phone: '+91 97400 55621', available: true },
  { name: 'Rex Kumar', emp: 'EMP10003', dept: 'Executive Office', site: SITES[4], phone: '+91 98800 10003', available: true },
  { name: 'Michael Chen', emp: 'EMP10094', dept: 'IT', site: SITES[0], phone: '+91 98220 77310', available: true },
  { name: 'Maria Santos', emp: 'EMP10101', dept: 'Compliance', site: SITES[0], phone: '+91 98330 61200', available: true },
];
export const hostOf = (n: string) => HOSTS.find((h) => h.name === n) ?? HOSTS[0];

export type VmState = 'Expected' | 'Pending Approval' | 'Checked In' | 'Checked Out' | 'Overdue' | 'Cancelled';
export interface VmVisitor {
  id: string; // VIS-000784
  name: string;
  company: string;
  type: string;
  purpose: string;
  host: string;
  site: string;
  areas: string[];
  email: string;
  phone: string;
  /** minutes since midnight (today) */
  arrival: number;
  departure: number;
  checkIn: number | null; // minutes since midnight
  checkOut: number | null;
  status: VmState;
  badge: string;
  idType: string;
  idNo: string;
  vehicle: string;
  risk: 'Low' | 'Medium' | 'High';
  escort: string;
  location: string;
  vip?: boolean;
}

const CAST: Partial<VmVisitor>[] = [
  { name: 'Arjun Mehta', company: 'Tech Solutions Pvt. Ltd.', purpose: 'Business Meeting', host: 'Priya Sharma', site: SITES[0], areas: ['Main Entrance', 'Meeting Rooms', 'Visitor Lounge'], arrival: 630, departure: 750, checkIn: 624, status: 'Checked In', badge: 'VIS-000784', idType: 'Passport', idNo: 'P•••••7842', vehicle: 'DL 4C AB 1234', escort: 'Priya Sharma', location: 'Meeting Rooms – 3F' },
  { name: 'Sarah Khan', company: 'Gulf Logistics', type: 'Delivery', purpose: 'Delivery', host: 'Ahmed Hassan', site: SITES[1], areas: ['Main Entrance', 'Reception'], arrival: 840, departure: 900, checkIn: 621, status: 'Checked In', badge: 'VIS-000783', idType: 'Passport', idNo: 'P•••••5521', escort: 'Ahmed Hassan', location: 'Main Entrance' },
  { name: 'David Lee', company: 'ABC Contractors', type: 'Contractor', purpose: 'Site Visit', host: 'Ramesh Kumar', site: SITES[3], areas: ['Main Entrance', 'Plant Floor'], arrival: 630, departure: 780, checkIn: null, status: 'Expected', badge: '', idType: 'Driver License', idNo: 'D•••••1190', risk: 'High', escort: 'Ramesh Kumar', location: 'Reception' },
  { name: 'Maria Santos', company: 'Global IT', type: 'Interview Candidate', purpose: 'Interview', host: 'Li Wei', site: SITES[0], areas: ['Main Entrance', 'Meeting Rooms', 'Visitor Lounge'], arrival: 870, departure: 960, checkIn: 615, status: 'Checked In', badge: 'VIS-000780', idType: 'National ID', idNo: 'N•••••6321', risk: 'Medium', escort: 'Li Wei', location: 'Visitor Lounge' },
  { name: 'Chen Wei', company: 'Facility Services', type: 'Vendor', purpose: 'Maintenance', host: 'Fatima Ali', site: SITES[2], areas: ['Main Entrance', 'Plant Floor'], arrival: 540, departure: 660, checkIn: 495, status: 'Overdue', badge: 'VIS-000778', idType: 'Aadhaar', idNo: 'XXXX XXXX 4410', risk: 'Medium', escort: 'Fatima Ali', location: 'Plant Site – North Block' },
  { name: 'Ahmed Raza', company: 'SecureTech', purpose: 'Business Meeting', host: 'Priya Sharma', site: SITES[0], areas: ['Main Entrance', 'Meeting Rooms'], arrival: 450, departure: 570, checkIn: 460, checkOut: 575, status: 'Checked Out', badge: 'VIS-000776', idType: 'Emirates ID', idNo: '784-••••-••••-2', escort: '', location: '—' },
];
const FIRST = ['Rohan', 'Aisha', 'Vikram', 'Neha', 'Karan', 'Meera', 'Omar', 'Hana', 'Rahul', 'Sara', 'Imran', 'Emily', 'Tom', 'Nadia', 'Yusuf', 'Olivia', 'Sanjay', 'Layla', 'Daniel', 'Grace', 'Faisal', 'Anil', 'Zara', 'Ken'];
const LAST = ['Verma', 'Noor', 'Iyer', 'Gupta', 'Malik', 'Clark', 'Yusuf', 'Brown', 'Nair', 'Ahmed', 'Kapoor', 'Wong', 'Patel', 'Karim', 'Singh', 'Das'];
const COS = ['Tech Solutions', 'Gulf Logistics', 'ABC Contractors', 'Global IT', 'Facility Services', 'SecureTech', 'Vertex Systems', 'Purple Holdings', 'Global Ventures', 'Blue Dart', 'Siemens', 'PwC', 'DHL', 'Infosys'];
const rnd = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

function seed(): VmVisitor[] {
  const out: VmVisitor[] = CAST.map((c, i) => base(c, i));
  const r = rnd(784);
  // 86 on-site today = 79 checked in + 7 overdue (cast contributes 3 + 1) + expected + pending + checked-out
  const plan: [VmState, number][] = [['Checked In', 76], ['Overdue', 6], ['Expected', 40], ['Pending Approval', 24], ['Checked Out', 30]];
  let n = 0;
  for (const [st, cnt] of plan)
    for (let k = 0; k < cnt; k++, n++) {
      const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
      const arrival = 450 + Math.floor(r() * 540);
      const ci = st === 'Checked In' || st === 'Overdue' || st === 'Checked Out' ? Math.max(420, Math.min(626, arrival - 10 + Math.floor(r() * 30))) : null;
      out.push(base({
        name,
        company: COS[Math.floor(r() * COS.length)],
        type: VISITOR_TYPES[Math.floor(r() * 6)],
        purpose: PURPOSES[Math.floor(r() * 6)],
        host: HOSTS[Math.floor(r() * 6)].name,
        site: SITES[Math.floor(r() * 4)],
        arrival: ci ?? 640 + Math.floor(r() * 380),
        checkIn: ci,
        checkOut: st === 'Checked Out' ? (ci ?? 480) + 40 + Math.floor(r() * 90) : null,
        status: st,
        risk: r() < 0.7 ? 'Low' : r() < 0.85 ? 'Medium' : 'High',
        location: AREAS[Math.floor(r() * 8)],
      }, 100 + n));
    }
  return out;
}
function base(c: Partial<VmVisitor>, i: number): VmVisitor {
  const name = c.name!;
  const id = c.badge || `VIS-${String(775 - i).padStart(6, '0')}`;
  const site = c.site ?? SITES[0];
  return {
    id,
    name,
    company: c.company ?? 'Tech Solutions',
    type: c.type ?? 'Business Visitor',
    purpose: c.purpose ?? 'Business Meeting',
    host: c.host ?? 'Priya Sharma',
    site,
    areas: c.areas ?? ['Main Entrance', 'Meeting Rooms'],
    email: c.email ?? `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${(c.company ?? 'techsolutions').toLowerCase().replace(/[^a-z]/g, '')}.com`,
    phone: c.phone ?? `+91 9${String(8765432100 + i * 7919).slice(0, 4)} ${String(43210 + i * 37).slice(0, 5)}`,
    arrival: c.arrival ?? 600,
    departure: c.departure ?? (c.arrival ?? 600) + 120,
    checkIn: c.checkIn ?? null,
    checkOut: c.checkOut ?? null,
    status: c.status ?? 'Expected',
    badge: c.status === 'Checked In' || c.status === 'Overdue' || c.status === 'Checked Out' ? id : c.badge ?? '',
    idType: c.idType ?? ID_TYPES[i % ID_TYPES.length],
    idNo: c.idNo ?? `•••••${String(1000 + ((i * 7331) % 9000))}`,
    vehicle: c.vehicle ?? '',
    risk: c.risk ?? 'Low',
    escort: c.escort ?? c.host ?? '',
    location: c.location ?? 'Reception',
    vip: c.vip,
  };
}

/** "10:24 AM" from minutes since midnight. */
export const hm = (m: number | null) => {
  if (m == null) return '—';
  const h = Math.floor(m / 60), mm = m % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
/** "1h 42m" between two minute marks. */
export const dur = (from: number | null, to: number) => {
  if (from == null) return '—';
  const d = Math.max(0, to - from);
  return d >= 60 ? `${Math.floor(d / 60)}h ${d % 60}m` : `${d}m`;
};

export interface VmEvent { at: number; text: string; kind: 'checkin' | 'checkout' | 'approval' | 'alert' | 'notify' | 'badge' | 'system'; visitor?: string }

@Injectable({ providedIn: 'root' })
export class VmStore {
  /** Demo clock: "now" = 10:24 AM (minutes since midnight), advanced by pages via AppState tick if wanted. */
  readonly now = signal(624);
  readonly visitors = signal<VmVisitor[]>(seed());
  readonly events = signal<VmEvent[]>([
    { at: 624, text: 'Arjun Mehta checked in at Main Entrance', kind: 'checkin', visitor: 'VIS-000784' },
    { at: 621, text: 'Sarah Khan checked in at Main Campus – Tower B', kind: 'checkin', visitor: 'VIS-000783' },
    { at: 610, text: 'Host Priya Sharma notified of 3 arrivals today', kind: 'notify' },
  ]);
  private seq = 785;

  readonly onSite = computed(() => this.visitors().filter((v) => v.status === 'Checked In' || v.status === 'Overdue'));
  readonly byId = (id: string) => this.visitors().find((v) => v.id === id) ?? null;
  readonly byName = (n: string) => this.visitors().find((v) => v.name === n) ?? null;

  nextBadge() { return `VIS-${String(this.seq++).padStart(6, '0')}`; }
  log(e: Omit<VmEvent, 'at'>) { this.events.update((l) => [{ at: this.now(), ...e }, ...l].slice(0, 200)); }
  patch(id: string, c: Partial<VmVisitor>) { this.visitors.update((l) => l.map((v) => (v.id === id ? { ...v, ...c } : v))); }
  checkIn(id: string) {
    const v = this.byId(id); if (!v) return;
    const badge = v.badge || v.id; // visit id doubles as badge number
    this.patch(id, { badge, status: 'Checked In', checkIn: this.now(), location: 'Main Entrance' });
    this.log({ text: `${v.name} checked in at ${v.site}`, kind: 'checkin', visitor: badge });
    return badge;
  }
  checkOut(id: string) {
    const v = this.byId(id); if (!v) return;
    this.patch(id, { status: 'Checked Out', checkOut: this.now(), location: '—' });
    this.log({ text: `${v.name} checked out`, kind: 'checkout', visitor: id });
  }
  add(v: Partial<VmVisitor> & { name: string }, status: VmState = 'Expected'): VmVisitor {
    const id = this.nextBadge();
    const nv = base({ ...v, badge: id, status, checkIn: status === 'Checked In' ? this.now() : null }, this.seq);
    nv.id = id;
    this.visitors.update((l) => [nv, ...l]);
    this.log({ text: `${nv.name} ${status === 'Checked In' ? 'registered & checked in' : 'registered'} (${nv.purpose})`, kind: status === 'Checked In' ? 'checkin' : 'system', visitor: id });
    return nv;
  }
}
