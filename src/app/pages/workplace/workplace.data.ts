// Workplace & Facility Services: one shared dataset + a root store so bookings, requests and approvals sync across pages.
import { computed, Injectable, signal } from '@angular/core';

/** Demo "today" (matches the reference dashboard). */
export const TODAY = '2026-10-14';
export const ME = 'Rex Kumar';
export const WP_SITES = ['Head Office', 'Tech Park', 'Downtown Hub'] as const;

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtD = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MON[m - 1]} ${y}`;
};
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const AV = ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-16a34a)', 'var(--ka-ea580c)', 'var(--ka-db2777)', 'var(--ka-0891b2)', 'var(--ka-9333ea)', 'var(--ka-ca8a04)', 'var(--ka-dc2626)', 'var(--ka-4f46e5)'];
export const avColor = (n: string) => AV[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
export const initials = (n: string) => n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export const NAMES = [
  'Aisha Rahman', 'Omar Haddad', 'Priya Nair', 'James Carter', 'Fatima Al Zahra', 'Liam Chen', 'Sara Mansour', 'Arjun Mehta', 'Noura Saeed', 'Daniel Brooks',
  'Mariam Khalil', 'Vikram Rao', 'Emily Clarke', 'Yousef Nasser', 'Hannah Lee', 'Rashid Al Amiri', 'Sophia Martins', 'Karim Fares', 'Ananya Iyer', 'Lucas Moreau',
  'Layla Hassan', 'Ethan Wright', 'Zainab Qureshi', 'Ravi Shankar', 'Chloe Dubois', 'Tariq Aziz', 'Meera Pillai', 'Noah Fischer', 'Huda Barakat', 'Kevin O’Neil',
];

/* ---------------- Desks & floor layout ---------------- */
export type DeskStatus = 'available' | 'occupied' | 'reserved' | 'maintenance';
export type DeskType = 'Standard Desk' | 'Hot Desk' | 'Focus Desk' | 'Collaboration Area';
export type ZoneKey = 'focus' | 'collab' | 'open' | 'quiet' | 'team';
export const DESK_TYPES: DeskType[] = ['Standard Desk', 'Hot Desk', 'Focus Desk', 'Collaboration Area'];
export const AMENITIES = ['Monitor', 'Dual Monitor', 'Power', 'LAN', 'Standing Desk', 'Docking Station', 'Near Window'];
export const STATUS_COLOR: Record<DeskStatus, string> = { available: 'var(--ka-22c55e)', occupied: 'var(--ka-ef4444)', reserved: 'var(--ka-9ca3af)', maintenance: 'var(--ka-f59e0b)' };
export const STATUS_LABEL: Record<DeskStatus, string> = { available: 'Available', occupied: 'Occupied', reserved: 'Reserved', maintenance: 'Maintenance' };

export interface ZoneDef { key: ZoneKey; name: string; letter: string; type: DeskType; x: number; y: number; w: number; h: number; fill: string; stroke: string }
/** Floor-plan zones, SVG viewBox 600 × 372. */
export const ZONES: ZoneDef[] = [
  { key: 'focus', name: 'Focus Zone', letter: 'F', type: 'Focus Desk', x: 10, y: 10, w: 172, h: 138, fill: 'var(--kb-e4e6fb)', stroke: 'var(--ka-c7cbf3)' },
  { key: 'collab', name: 'Collaboration Area', letter: 'C', type: 'Collaboration Area', x: 184, y: 10, w: 176, h: 104, fill: 'var(--kb-fdf1dc)', stroke: 'var(--ka-f6d9a8)' },
  { key: 'open', name: 'Open Workspace', letter: 'A', type: 'Standard Desk', x: 362, y: 10, w: 228, h: 146, fill: 'var(--kb-dff6e6)', stroke: 'var(--ka-b6e8c5)' },
  { key: 'quiet', name: 'Quiet Zone', letter: 'Q', type: 'Focus Desk', x: 10, y: 208, w: 290, h: 154, fill: 'var(--kb-dbeafe)', stroke: 'var(--ka-b9d4fb)' },
  { key: 'team', name: 'Team Area', letter: 'T', type: 'Hot Desk', x: 302, y: 248, w: 288, h: 114, fill: 'var(--kb-fde4e6)', stroke: 'var(--ka-f8c4c9)' },
];
interface Slot { zone: ZoneKey; n: number; x: number; y: number; shape: 'desk' | 'cubicle' | 'table' | 'round' }
const SLOTS: Slot[] = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ zone: 'focus' as ZoneKey, n: i + 1, x: 34 + (i % 4) * 40, y: i < 4 ? 62 : 108, shape: 'desk' as const })),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => ({ zone: 'open' as ZoneKey, n: i + 1, x: 384 + (i % 6) * 37, y: i < 6 ? 62 : 108, shape: 'desk' as const })),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ zone: 'quiet' as ZoneKey, n: i + 1, x: 44 + (i % 4) * 66, y: i < 4 ? 262 : 320, shape: 'cubicle' as const })),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ zone: 'team' as ZoneKey, n: i + 1, x: 340 + (i % 4) * 68, y: i < 4 ? 294 : 340, shape: 'table' as const })),
  { zone: 'collab', n: 1, x: 222, y: 66, shape: 'round' },
  { zone: 'collab', n: 2, x: 322, y: 66, shape: 'round' },
  { zone: 'collab', n: 3, x: 272, y: 74, shape: 'table' },
];
/** Floors per site (desk floors first-to-last as listed in the floor rail). */
export const FLOORS: Record<string, { name: string; desks: boolean }[]> = {
  'Head Office': [{ name: 'Roof', desks: false }, ...[8, 7, 6, 5, 4, 3, 2, 1].map((n) => ({ name: `Floor ${n}`, desks: true })), { name: 'Ground Floor', desks: false }],
  'Tech Park': [{ name: 'Floor 2', desks: true }, { name: 'Floor 1', desks: true }, { name: 'Ground Floor', desks: false }],
  'Downtown Hub': [{ name: 'Floor 1', desks: true }, { name: 'Ground Floor', desks: false }],
};

export interface Desk {
  id: string;
  name: string;
  site: string;
  floor: string;
  zone: ZoneKey;
  type: DeskType;
  x: number;
  y: number;
  shape: Slot['shape'];
  status: DeskStatus;
  amenities: string[];
  occupant?: string;
  mine?: boolean;
  until?: string;
}
// Hand-placed statuses for Head Office · Floor 5 (focus 8, open 12, quiet 8, team 8, collab 3) to match the dashboard.
const F5 = 'aaoaoaao' + 'raoaoaoaraar' + 'aoaarrar' + 'aaoaaorm' + 'aoa';
const CODE: Record<string, DeskStatus> = { a: 'available', o: 'occupied', r: 'reserved', m: 'maintenance' };
const TARGET: Record<DeskStatus, number> = { available: 186, occupied: 214, reserved: 12, maintenance: 8 };

function buildDesks(): Desk[] {
  const r = rng(42);
  const list: Desk[] = [];
  for (const site of WP_SITES) {
    for (const f of FLOORS[site].filter((x) => x.desks)) {
      const num = f.name.replace('Floor ', '');
      const slots = site === 'Downtown Hub' ? SLOTS.filter((s) => s.zone !== 'quiet' && !(s.zone === 'collab' && s.n === 3)) : SLOTS;
      for (const s of slots) {
        const z = ZONES.find((q) => q.key === s.zone)!;
        const prefix = site === 'Head Office' ? '' : site === 'Tech Park' ? 'T' : 'D';
        const label = s.zone === 'collab' ? `Collab Table ${prefix}${num}C-0${s.n}` : `Desk ${prefix}${num}${z.letter}-${String(s.n).padStart(2, '0')}`;
        const type: DeskType = s.zone === 'open' && s.n > 9 ? 'Hot Desk' : z.type;
        const am = ['Power'];
        if (s.zone !== 'collab') am.push(r() < 0.25 ? 'Dual Monitor' : 'Monitor', 'LAN');
        if (r() < 0.25) am.push('Standing Desk');
        if (r() < 0.3) am.push('Docking Station');
        if (s.y < 80 || s.x < 50 || s.x > 560) am.push('Near Window');
        list.push({ id: `${site[0]}${num}-${s.zone}-${s.n}`, name: label, site, floor: f.name, zone: s.zone, type, x: s.x, y: s.y, shape: s.shape, status: 'available', amenities: am });
      }
    }
  }
  // Floor 5 statuses are hand placed; the rest are shuffled to hit the enterprise totals exactly.
  const f5 = list.filter((d) => d.site === 'Head Office' && d.floor === 'Floor 5');
  f5.forEach((d, i) => (d.status = CODE[F5[i]] ?? 'available'));
  const rest = list.filter((d) => !f5.includes(d));
  const pool: DeskStatus[] = [];
  (Object.keys(TARGET) as DeskStatus[]).forEach((s) => {
    const left = TARGET[s] - f5.filter((d) => d.status === s).length;
    for (let i = 0; i < left; i++) pool.push(s);
  });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  rest.forEach((d, i) => (d.status = pool[i] ?? 'available'));
  let k = 0;
  for (const d of list) {
    if (d.status === 'occupied' || d.status === 'reserved') d.occupant = NAMES[k++ % NAMES.length];
    if (d.status === 'occupied') d.until = ['05:00 PM', '06:00 PM', '01:00 PM', '03:30 PM'][k % 4];
  }
  const mine = list.find((d) => d.name === 'Desk 5A-12')!;
  Object.assign(mine, { status: 'reserved', mine: true, occupant: ME, until: '06:00 PM' });
  return list;
}

/* ---------------- Rooms ---------------- */
export interface Room { id: string; name: string; kind: 'Meeting Room' | 'Focus Room' | 'Collaboration Area' | 'Board Room' | 'Training Room'; site: string; floor: string; capacity: number; equipment: string[]; approval?: boolean; color: string }
export const ROOMS: Room[] = [
  { id: 'R1', name: 'Meeting Room A', kind: 'Meeting Room', site: 'Head Office', floor: 'Floor 5', capacity: 8, equipment: ['Display', 'Video Conf', 'Whiteboard'], color: 'var(--ka-ef4444)' },
  { id: 'R2', name: 'Meeting Room B', kind: 'Meeting Room', site: 'Head Office', floor: 'Floor 5', capacity: 6, equipment: ['Display', 'Whiteboard'], color: 'var(--ka-ef4444)' },
  { id: 'R3', name: 'Focus Room 1', kind: 'Focus Room', site: 'Head Office', floor: 'Floor 5', capacity: 2, equipment: ['Display'], color: 'var(--ka-3b82f6)' },
  { id: 'R4', name: 'Focus Room 2', kind: 'Focus Room', site: 'Head Office', floor: 'Floor 5', capacity: 2, equipment: ['Display'], color: 'var(--ka-3b82f6)' },
  { id: 'R5', name: 'Board Room', kind: 'Board Room', site: 'Head Office', floor: 'Floor 8', capacity: 16, equipment: ['Display', 'Video Conf', 'Catering', 'Recording'], approval: true, color: 'var(--ka-7c3aed)' },
  { id: 'R6', name: 'Innovation Lab', kind: 'Collaboration Area', site: 'Head Office', floor: 'Floor 6', capacity: 12, equipment: ['Display', 'Whiteboard', 'Video Conf'], color: 'var(--ka-f59e0b)' },
  { id: 'R7', name: 'Training Room', kind: 'Training Room', site: 'Head Office', floor: 'Floor 2', capacity: 24, equipment: ['Projector', 'Video Conf', 'Recording'], approval: true, color: 'var(--ka-16a34a)' },
  { id: 'R8', name: 'Huddle 3A', kind: 'Meeting Room', site: 'Head Office', floor: 'Floor 3', capacity: 4, equipment: ['Display'], color: 'var(--ka-ef4444)' },
  { id: 'R9', name: 'Orion', kind: 'Meeting Room', site: 'Tech Park', floor: 'Floor 2', capacity: 10, equipment: ['Display', 'Video Conf'], color: 'var(--ka-ef4444)' },
  { id: 'R10', name: 'Vega', kind: 'Meeting Room', site: 'Tech Park', floor: 'Floor 1', capacity: 6, equipment: ['Display', 'Whiteboard'], color: 'var(--ka-ef4444)' },
  { id: 'R11', name: 'Focus Pod T1', kind: 'Focus Room', site: 'Tech Park', floor: 'Floor 1', capacity: 1, equipment: ['Power'], color: 'var(--ka-3b82f6)' },
  { id: 'R12', name: 'Harbor', kind: 'Meeting Room', site: 'Downtown Hub', floor: 'Floor 1', capacity: 8, equipment: ['Display', 'Video Conf'], color: 'var(--ka-ef4444)' },
  { id: 'R13', name: 'Skyline Hub', kind: 'Collaboration Area', site: 'Downtown Hub', floor: 'Floor 1', capacity: 14, equipment: ['Display', 'Whiteboard'], color: 'var(--ka-f59e0b)' },
];
export const HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
export const toMin = (t: string) => {
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)?/i)!;
  let h = +m[1];
  if (m[3]) h = (h % 12) + (/pm/i.test(m[3]) ? 12 : 0);
  return h * 60 + +m[2];
};
export const to12 = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/* ---------------- Bookings ---------------- */
export type BookingKind = 'Desk' | 'Meeting Room' | 'Focus Room' | 'Collaboration Area' | 'Parking' | 'Asset';
export interface Booking { id: string; kind: BookingKind; resource: string; resourceId: string; location: string; date: string; from: string; to: string; status: 'Confirmed' | 'Pending' | 'Checked In' | 'Cancelled' | 'Rejected'; by: string; title?: string; attendees?: number }
const kindOfRoom = (r: Room): BookingKind => (r.kind === 'Focus Room' ? 'Focus Room' : r.kind === 'Collaboration Area' ? 'Collaboration Area' : 'Meeting Room');
function seedBookings(): Booking[] {
  const b: Booking[] = [
    { id: 'BK-24101', kind: 'Desk', resource: 'Desk 5A-12', resourceId: 'H5-open-12', location: 'Head Office - Floor 5 - Open Workspace', date: TODAY, from: '09:00 AM', to: '06:00 PM', status: 'Confirmed', by: ME },
    { id: 'BK-24102', kind: 'Meeting Room', resource: 'Meeting Room A', resourceId: 'R1', location: 'Head Office - Floor 5', date: TODAY, from: '02:00 PM', to: '03:00 PM', status: 'Confirmed', by: ME, title: 'Q4 Facilities Review', attendees: 6 },
    { id: 'BK-24103', kind: 'Focus Room', resource: 'Focus Room 1', resourceId: 'R3', location: 'Head Office - Floor 5', date: addDays(TODAY, 1), from: '10:00 AM', to: '12:00 PM', status: 'Confirmed', by: ME },
  ];
  const titles = ['Sprint Planning', 'Client Call', 'Design Review', '1:1', 'Vendor Meeting', 'All Hands Prep', 'Interview', 'Budget Sync', 'Training Session', 'Board Meeting', 'Workshop', 'Stand-up'];
  const r = rng(7);
  let n = 24110;
  for (let day = -6; day <= 3; day++) {
    const date = addDays(TODAY, day);
    for (const room of ROOMS) {
      let h = 8 + Math.floor(r() * 2);
      while (h < 18) {
        if (r() < 0.55) {
          const len = room.kind === 'Focus Room' ? 1 : r() < 0.6 ? 1 : 2;
          const end = Math.min(18, h + len);
          if (!(room.id === 'R1' && date === TODAY && h <= 14 && end > 14) && !(room.id === 'R3' && date === addDays(TODAY, 1) && h <= 11 && end > 10)) {
            const pending = room.approval && day >= 0 && r() < 0.5;
            b.push({ id: `BK-${n++}`, kind: kindOfRoom(room), resource: room.name, resourceId: room.id, location: `${room.site} - ${room.floor}`, date, from: to12(`${h}:00`), to: to12(`${end}:00`), status: pending ? 'Pending' : 'Confirmed', by: NAMES[Math.floor(r() * NAMES.length)], title: titles[Math.floor(r() * titles.length)], attendees: Math.max(1, Math.round(room.capacity * (0.4 + r() * 0.6))) });
          }
          h = end + (r() < 0.5 ? 1 : 0);
        } else h += 1;
      }
    }
  }
  return b;
}

/* ---------------- Parking ---------------- */
export type BayType = 'Standard' | 'EV Charging' | 'Accessible' | 'Visitor' | 'Motorcycle';
export interface Bay { id: string; site: string; level: string; row: string; n: number; type: BayType; status: 'available' | 'occupied' | 'reserved'; plate?: string; mine?: boolean; charge?: number }
export const PARKING_LEVELS: Record<string, string[]> = { 'Head Office': ['B1', 'B2'], 'Tech Park': ['P1'], 'Downtown Hub': ['P1'] };
function buildBays(): Bay[] {
  const r = rng(11);
  const out: Bay[] = [];
  const plates = () => `${['A', 'B', 'C', 'D', 'K', 'M'][Math.floor(r() * 6)]} ${10000 + Math.floor(r() * 89999)}`;
  for (const site of WP_SITES) {
    for (const level of PARKING_LEVELS[site]) {
      const rows = site === 'Head Office' ? ['A', 'B', 'C', 'D'] : site === 'Tech Park' ? ['A', 'B', 'C'] : ['A', 'B'];
      for (const row of rows) {
        for (let n = 1; n <= 15; n++) {
          const type: BayType = row === 'A' && n <= 3 ? 'Accessible' : row === 'A' && n >= 12 ? 'Visitor' : row === rows[rows.length - 1] && n <= 5 ? 'EV Charging' : row === 'B' && n === 15 ? 'Motorcycle' : 'Standard';
          const x = r();
          const status = x < 0.62 ? 'occupied' : x < 0.7 ? 'reserved' : 'available';
          out.push({ id: `${site[0]}-${level}-${row}${n}`, site, level, row, n, type, status, plate: status !== 'available' ? plates() : undefined, charge: type === 'EV Charging' && status === 'occupied' ? Math.round(20 + r() * 75) : undefined });
        }
      }
    }
  }
  return out;
}

/* ---------------- Assets ---------------- */
export interface Asset { id: string; name: string; category: string; icon: string; site: string; total: number; out: number; reservedToday: number; condition: 'Good' | 'Fair' | 'Needs Service'; deposit?: boolean }
export const ASSETS: Asset[] = [
  { id: 'AS-01', name: 'Dell Latitude 7440 Laptop', category: 'Laptops', icon: 'w-laptop', site: 'Head Office', total: 40, out: 27, reservedToday: 4, condition: 'Good' },
  { id: 'AS-02', name: 'MacBook Pro 14"', category: 'Laptops', icon: 'w-laptop', site: 'Head Office', total: 18, out: 13, reservedToday: 2, condition: 'Good' },
  { id: 'AS-03', name: 'Epson 4K Projector', category: 'AV Equipment', icon: 'w-projector', site: 'Head Office', total: 8, out: 3, reservedToday: 2, condition: 'Good' },
  { id: 'AS-04', name: 'Logitech Rally Camera Kit', category: 'AV Equipment', icon: 'w-camera', site: 'Head Office', total: 6, out: 4, reservedToday: 1, condition: 'Fair' },
  { id: 'AS-05', name: 'Portable 27" Monitor', category: 'Peripherals', icon: 'w-monitor', site: 'Head Office', total: 24, out: 15, reservedToday: 3, condition: 'Good' },
  { id: 'AS-06', name: 'Jabra Evolve2 Headset', category: 'Peripherals', icon: 'w-headset', site: 'Tech Park', total: 50, out: 31, reservedToday: 5, condition: 'Good' },
  { id: 'AS-07', name: 'iPad Pro 12.9"', category: 'Tablets', icon: 'w-tablet', site: 'Tech Park', total: 14, out: 9, reservedToday: 2, condition: 'Good', deposit: true },
  { id: 'AS-08', name: 'Meta Quest 3 VR Kit', category: 'Innovation', icon: 'w-headset', site: 'Tech Park', total: 6, out: 2, reservedToday: 1, condition: 'Good', deposit: true },
  { id: 'AS-09', name: 'Mobile Whiteboard', category: 'Furniture', icon: 'w-room', site: 'Head Office', total: 12, out: 7, reservedToday: 1, condition: 'Fair' },
  { id: 'AS-10', name: 'Event PA Speaker Set', category: 'AV Equipment', icon: 'megaphone', site: 'Downtown Hub', total: 4, out: 1, reservedToday: 1, condition: 'Needs Service' },
  { id: 'AS-11', name: 'Docking Station USB-C', category: 'Peripherals', icon: 'plug', site: 'Downtown Hub', total: 30, out: 22, reservedToday: 2, condition: 'Good' },
  { id: 'AS-12', name: 'DSLR Camera Kit', category: 'Innovation', icon: 'w-camera', site: 'Head Office', total: 3, out: 1, reservedToday: 0, condition: 'Good', deposit: true },
];

/* ---------------- Requests (facility, maintenance, housekeeping, service) ---------------- */
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';
export type ReqStatus = 'Open' | 'Assigned' | 'In Progress' | 'On Hold' | 'Resolved' | 'Closed';
export interface Request {
  id: string;
  title: string;
  category: string;
  kind: 'Facility' | 'Maintenance' | 'Service';
  site: string;
  location: string;
  priority: Priority;
  status: ReqStatus;
  requester: string;
  assignee: string;
  createdH: number; // hours ago when created
  slaH: number;
  approval?: 'Pending' | 'Approved' | 'Rejected';
  cost?: number;
  woType?: 'Corrective' | 'Preventive' | 'Inspection';
  asset?: string;
  notes: { at: string; by: string; text: string }[];
}
export const CATEGORIES = ['HVAC', 'Electrical', 'Plumbing', 'Cleaning', 'IT & AV', 'Furniture', 'Pantry', 'Security', 'Lighting', 'Pest Control'];
export const SLA_HOURS: Record<Priority, number> = { Critical: 4, High: 8, Medium: 24, Low: 72 };
export const TEAMS = ['Facilities Team A', 'Facilities Team B', 'MEP Contractor', 'IT Service Desk', 'Housekeeping', 'Security Desk'];
const REQ_TITLES: [string, string][] = [
  ['AC not cooling in open workspace', 'HVAC'], ['Flickering lights near Desk 5Q-04', 'Lighting'], ['Water leak in pantry sink', 'Plumbing'], ['Meeting Room A display not working', 'IT & AV'],
  ['Broken chair at Desk 3A-07', 'Furniture'], ['Restroom needs cleaning - Floor 4', 'Cleaning'], ['Coffee machine out of order', 'Pantry'], ['Access door alarm beeping', 'Security'],
  ['Power socket faulty - Desk 6F-02', 'Electrical'], ['Temperature too high in Board Room', 'HVAC'], ['Ants spotted in Floor 2 pantry', 'Pest Control'], ['Projector bulb replacement', 'IT & AV'],
  ['Spill on carpet near lifts', 'Cleaning'], ['Blind stuck in Focus Room 2', 'Furniture'], ['Low water pressure in restroom', 'Plumbing'], ['Emergency light not working', 'Lighting'],
  ['Video conference echo in Orion', 'IT & AV'], ['Drinking water dispenser empty', 'Pantry'], ['UPS beeping in comms room', 'Electrical'], ['Desk height motor stuck', 'Furniture'],
];
const WO: [string, string, 'Corrective' | 'Preventive' | 'Inspection'][] = [
  ['Quarterly AHU-05 filter replacement', 'AHU-05 · Floor 5 plant room', 'Preventive'], ['Chiller 2 vibration inspection', 'Chiller 2 · Roof', 'Inspection'], ['Lift 3 door sensor fault', 'Lift 3 · Core B', 'Corrective'],
  ['Generator load test', 'DG Set 1 · Basement', 'Preventive'], ['Fire pump weekly run', 'Fire Pump · B2', 'Preventive'], ['Replace monitor arm - Desk 5Q-06', 'Desk 5Q-06', 'Corrective'],
  ['Repair standing desk motor - 5T-08', 'Desk 5T-08', 'Corrective'], ['Cooling tower water treatment', 'Cooling Tower · Roof', 'Preventive'], ['BMS sensor calibration Floor 7', 'BMS · Floor 7', 'Inspection'],
  ['Replace pantry boiler valve', 'Pantry · Floor 3', 'Corrective'], ['EV charger 4 not charging', 'EV Bay D2 · B1', 'Corrective'], ['Roof drain cleaning', 'Roof', 'Preventive'],
  ['Lighting retrofit Floor 2 (LED)', 'Floor 2', 'Corrective'], ['Access reader firmware check', 'Doors L1-L4', 'Inspection'],
];
function seedRequests(): Request[] {
  const r = rng(99);
  const pr: Priority[] = ['Critical', 'High', 'High', 'Medium', 'Medium', 'Medium', 'Low', 'Low'];
  const st: ReqStatus[] = ['Open', 'Assigned', 'In Progress', 'In Progress', 'On Hold', 'Resolved', 'Closed', 'Closed'];
  const out: Request[] = [];
  for (let i = 0; i < 46; i++) {
    const [title, category] = REQ_TITLES[i % REQ_TITLES.length];
    const priority = pr[Math.floor(r() * pr.length)];
    const status = st[Math.floor(r() * st.length)];
    const site = WP_SITES[i % 7 === 0 ? 1 : i % 9 === 0 ? 2 : 0];
    const floor = `Floor ${1 + Math.floor(r() * 8)}`;
    out.push({
      id: `FR-2026-${String(1480 + i).padStart(4, '0')}`, title, category, kind: 'Facility', site, location: `${site} - ${floor}`, priority, status,
      requester: NAMES[Math.floor(r() * NAMES.length)], assignee: status === 'Open' ? 'Unassigned' : TEAMS[category === 'IT & AV' ? 3 : category === 'Cleaning' ? 4 : category === 'Security' ? 5 : Math.floor(r() * 3)],
      createdH: Math.round(r() * (status === 'Closed' || status === 'Resolved' ? 160 : SLA_HOURS[priority] * 1.15) * 10) / 10, slaH: SLA_HOURS[priority], cost: category === 'Furniture' || category === 'HVAC' ? Math.round(300 + r() * 4200) : undefined,
      approval: i % 6 === 2 ? (status === 'Open' || status === 'Assigned' ? 'Pending' : 'Approved') : undefined, notes: [{ at: 'Created', by: 'Requester', text: 'Request raised via People360 portal.' }],
    });
  }
  WO.forEach(([title, asset, woType], i) => {
    const status: ReqStatus = (['Open', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed'] as ReqStatus[])[i % 6];
    const priority: Priority = woType === 'Corrective' ? (i % 3 ? 'High' : 'Critical') : 'Medium';
    out.push({ id: `WO-2026-${String(820 + i).padStart(4, '0')}`, title, category: /desk|monitor/i.test(title) ? 'Furniture' : /EV|Lighting|Generator|UPS/i.test(title) ? 'Electrical' : /Lift|Access/i.test(title) ? 'Security' : 'HVAC', kind: 'Maintenance', woType, asset, site: i % 5 === 4 ? 'Tech Park' : 'Head Office', location: asset, priority, status, requester: 'CMMS Scheduler', assignee: ['Ahmed (MEP)', 'Joseph (HVAC)', 'Ravi (Electrical)', 'Otis Service', 'Carlos (Civil)'][i % 5], createdH: Math.round((woType === 'Preventive' ? 72 : SLA_HOURS[priority]) * [0.2, 0.5, 0.85, 1.25, 0.4, 0.6][i % 6] * 10) / 10, slaH: woType === 'Preventive' ? 72 : SLA_HOURS[priority], cost: Math.round(250 + ((i * 937) % 5200)), notes: [{ at: 'Created', by: 'CMMS', text: woType === 'Preventive' ? 'Auto-generated from PPM schedule.' : 'Raised from fault report.' }] });
  });
  return out;
}
export const slaState = (q: Request) => {
  if (q.status === 'Resolved' || q.status === 'Closed') return 'Met';
  const used = q.createdH / q.slaH;
  return used >= 1 ? 'Breached' : used >= 0.75 ? 'At Risk' : 'On Track';
};

/* ---------------- Housekeeping ---------------- */
export interface CleanTask { id: string; area: string; site: string; floor: string; task: string; time: string; staff: string; status: 'Pending' | 'In Progress' | 'Done' | 'Missed'; checklist: { item: string; done: boolean }[]; trigger: 'Scheduled' | 'Post-booking' | 'On demand' | 'Sensor' }
export const CLEANERS = ['Maria Santos', 'Joy Fernandes', 'Abdul Karim', 'Lina Gomez', 'Ramesh Thapa', 'Grace Okafor', 'Suresh Kumar', 'Nadia Ali'];
const CLEAN_DEF: [string, string, string[]][] = [
  ['Desk sanitization', 'Open Workspace', ['Wipe desk surface', 'Sanitize keyboard tray', 'Empty bin', 'Reset chair']],
  ['Restroom clean', 'Restrooms Core A', ['Clean basins', 'Refill soap & paper', 'Mop floor', 'Check odour sensor']],
  ['Meeting room reset', 'Meeting Room A', ['Clear whiteboard', 'Arrange chairs', 'Wipe table', 'Remove cups']],
  ['Pantry deep clean', 'Pantry', ['Clean coffee machine', 'Wipe counters', 'Empty fridge expired items', 'Mop floor']],
  ['Lobby vacuum', 'Lift Lobby', ['Vacuum carpet', 'Polish glass', 'Dust surfaces']],
  ['Focus room sanitize', 'Focus Room 1', ['Wipe desk', 'Sanitize headset hooks', 'Empty bin']],
  ['Waste collection', 'All zones', ['Collect general waste', 'Collect recycling', 'Replace liners']],
];
function seedCleaning(): CleanTask[] {
  const out: CleanTask[] = [];
  let n = 1;
  for (let h = 7; h <= 18; h++) {
    for (let k = 0; k < 2; k++) {
      const [task, area, items] = CLEAN_DEF[(h * 2 + k) % CLEAN_DEF.length];
      const floor = `Floor ${((h + k * 3) % 8) + 1}`;
      const status = h < 10 ? (h === 8 && k === 1 ? 'Missed' : 'Done') : h === 10 ? 'In Progress' : 'Pending';
      out.push({ id: `HK-${String(n).padStart(3, '0')}`, task, area: area === 'Meeting Room A' && floor !== 'Floor 5' ? 'Meeting Room B' : area, site: (h + k) % 5 === 0 ? 'Tech Park' : 'Head Office', floor, time: to12(`${h}:${k ? '30' : '00'}`), staff: CLEANERS[(h + k) % CLEANERS.length], status, checklist: items.map((item, i) => ({ item, done: status === 'Done' || (status === 'In Progress' && i < 2) })), trigger: task === 'Desk sanitization' ? 'Post-booking' : task === 'Restroom clean' && h % 3 === 0 ? 'Sensor' : 'Scheduled' });
      n++;
    }
  }
  return out;
}

/* ---------------- Service catalog ---------------- */
export interface Service { id: string; name: string; category: string; icon: string; color: string; desc: string; slaH: number; approval: boolean; team: string; popular?: boolean; requests: number; rating: number }
export const SERVICES: Service[] = [
  { id: 'S01', name: 'Meeting Catering', category: 'Hospitality', icon: 'coffee', color: 'var(--ka-f59e0b)', desc: 'Tea, coffee, snacks or lunch delivered to your meeting room.', slaH: 24, approval: true, team: 'Pantry Services', popular: true, requests: 148, rating: 4.6 },
  { id: 'S02', name: 'New Joiner Workstation Setup', category: 'Workplace', icon: 'w-desk', color: 'var(--ka-7c3aed)', desc: 'Desk, chair, monitor, docking and access card for a new employee.', slaH: 48, approval: true, team: 'Facilities Team A', popular: true, requests: 62, rating: 4.7 },
  { id: 'S03', name: 'AV Support for Event', category: 'IT & AV', icon: 'w-projector', color: 'var(--ka-3b82f6)', desc: 'Technician on standby for town halls, workshops and hybrid meetings.', slaH: 24, approval: false, team: 'IT Service Desk', popular: true, requests: 91, rating: 4.5 },
  { id: 'S04', name: 'Furniture Move / Re-arrange', category: 'Workplace', icon: 'w-chair', color: 'var(--ka-7c3aed)', desc: 'Move desks, cabinets or re-arrange a team area.', slaH: 72, approval: true, team: 'Facilities Team B', requests: 37, rating: 4.2 },
  { id: 'S05', name: 'Locker Allocation', category: 'Workplace', icon: 'key-round', color: 'var(--ka-7c3aed)', desc: 'Request a personal day or permanent locker near your zone.', slaH: 8, approval: false, team: 'Facilities Team A', requests: 120, rating: 4.8 },
  { id: 'S06', name: 'Deep Cleaning Request', category: 'Housekeeping', icon: 'w-broom', color: 'var(--ka-16a34a)', desc: 'Ad-hoc deep clean for a room, pantry or spill.', slaH: 4, approval: false, team: 'Housekeeping', popular: true, requests: 205, rating: 4.4 },
  { id: 'S07', name: 'Courier & Mail Pickup', category: 'Logistics', icon: 'w-package', color: 'var(--ka-0891b2)', desc: 'Internal mail, courier dispatch and parcel collection.', slaH: 8, approval: false, team: 'Mailroom', requests: 176, rating: 4.6 },
  { id: 'S08', name: 'Stationery Supplies', category: 'Logistics', icon: 'file-text', color: 'var(--ka-0891b2)', desc: 'Notebooks, pens, printer paper and toner delivered to your desk.', slaH: 24, approval: false, team: 'Stores', requests: 233, rating: 4.3 },
  { id: 'S09', name: 'Visitor Parking Pass', category: 'Parking', icon: 'w-car', color: 'var(--ka-db2777)', desc: 'Reserve a visitor bay and send a QR pass to your guest.', slaH: 2, approval: false, team: 'Security Desk', requests: 158, rating: 4.7 },
  { id: 'S10', name: 'Temperature Adjustment', category: 'Building', icon: 'w-thermo', color: 'var(--ka-ef4444)', desc: 'Too hot or cold? Request a zone set-point change.', slaH: 4, approval: false, team: 'MEP Contractor', requests: 312, rating: 4.1 },
  { id: 'S11', name: 'Event Space Booking', category: 'Hospitality', icon: 'users', color: 'var(--ka-f59e0b)', desc: 'Book the atrium or training hall for events over 30 people.', slaH: 72, approval: true, team: 'Workplace Experience', requests: 24, rating: 4.5 },
  { id: 'S12', name: 'Signage & Printing', category: 'Logistics', icon: 'megaphone', color: 'var(--ka-0891b2)', desc: 'Banners, door signage and large-format printing.', slaH: 72, approval: true, team: 'Stores', requests: 19, rating: 4.0 },
];

/* ---------------- Utilization analytics (shared by desk page, space utilization, reports) ---------------- */
export const TOP_ZONES = [
  { label: 'Open Workspace', value: 92 }, { label: 'Collaboration Area', value: 78 }, { label: 'Team Area', value: 68 },
  { label: 'Focus Zone', value: 54 }, { label: 'Quiet Zone', value: 46 }, { label: 'Executive Area', value: 32 },
];
export const zoneColor = (v: number) => (v >= 85 ? 'var(--ka-ef4444)' : v >= 60 ? 'var(--ka-f59e0b)' : v >= 40 ? 'var(--ka-3b82f6)' : 'var(--ka-22c55e)');
export const USAGE_7D = { labels: ['8 Oct', '9 Oct', '10 Oct', '11 Oct', '12 Oct', '13 Oct', '14 Oct'], occ: [68, 82, 72, 64, 79, 76, 80], avail: [44, 35, 30, 33, 52, 45, 55] };
export const USAGE_PREV = { labels: ['1 Oct', '2 Oct', '3 Oct', '4 Oct', '5 Oct', '6 Oct', '7 Oct'], occ: [62, 71, 74, 58, 49, 66, 73], avail: [48, 40, 36, 52, 61, 44, 39] };
export const INSIGHTS = [
  { label: 'Standard Desk', value: 210, color: 'var(--ka-7c3aed)' }, { label: 'Hot Desk', value: 84, color: 'var(--ka-3b82f6)' }, { label: 'Focus Desk', value: 63, color: 'var(--ka-22c55e)' },
  { label: 'Collaboration Area', value: 42, color: 'var(--ka-f59e0b)' }, { label: 'Others', value: 21, color: 'var(--ka-a1a1aa)' },
];
export const UTIL_HOURS = ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM'];
export const FLOOR_HEAT: number[][] = [8, 7, 6, 5, 4, 3, 2, 1].map((f) => UTIL_HOURS.map((_, h) => {
  const curve = [22, 48, 74, 86, 70, 62, 84, 88, 76, 52, 24][h];
  return Math.max(6, Math.min(98, Math.round(curve + ((f * 13 + h * 7) % 17) - 8 + (f === 5 ? 8 : f === 8 ? -14 : 0))));
}));

/* ---------------- Store ---------------- */
@Injectable({ providedIn: 'root' })
export class WorkplaceStore {
  readonly desks = signal<Desk[]>(buildDesks());
  readonly bookings = signal<Booking[]>(seedBookings());
  readonly bays = signal<Bay[]>(buildBays());
  readonly assets = signal<Asset[]>(ASSETS.map((a) => ({ ...a })));
  readonly requests = signal<Request[]>(seedRequests());
  readonly cleaning = signal<CleanTask[]>(seedCleaning());
  private seq = 24300;

  readonly deskCounts = computed(() => {
    const c = { total: 0, available: 0, occupied: 0, reserved: 0, maintenance: 0 };
    for (const d of this.desks()) {
      c.total++;
      c[d.status]++;
    }
    return c;
  });
  readonly mine = computed(() => this.bookings().filter((b) => b.by === ME && b.status !== 'Cancelled' && b.status !== 'Rejected').sort((a, b) => (a.date + toMin(a.from)).localeCompare(b.date + toMin(b.from))));
  readonly myToday = computed(() => this.mine().filter((b) => b.date === TODAY));
  readonly myUpcoming = computed(() => this.mine().filter((b) => b.date >= TODAY));
  readonly pendingApprovals = computed(() => this.bookings().filter((b) => b.status === 'Pending').length + this.requests().filter((q) => q.approval === 'Pending').length);

  private nextId() {
    return `BK-${this.seq++}`;
  }
  bookDesk(d: Desk, date: string, from: string, to: string) {
    if (date === TODAY) this.desks.update((l) => l.map((x) => (x.id === d.id ? { ...x, status: 'reserved', mine: true, occupant: ME, until: to } : x)));
    const zone = ZONES.find((z) => z.key === d.zone)!.name;
    const b: Booking = { id: this.nextId(), kind: d.type === 'Collaboration Area' ? 'Collaboration Area' : 'Desk', resource: d.name, resourceId: d.id, location: `${d.site} - ${d.floor} - ${zone}`, date, from, to, status: 'Confirmed', by: ME };
    this.bookings.update((l) => [b, ...l]);
    this.addCleaning(d.name, d.site, d.floor, to);
    return b;
  }
  bookRoom(r: Room, date: string, from: string, to: string, title = 'Meeting', attendees = 2, by = ME) {
    const b: Booking = { id: this.nextId(), kind: kindOfRoom(r), resource: r.name, resourceId: r.id, location: `${r.site} - ${r.floor}`, date, from, to, status: r.approval ? 'Pending' : 'Confirmed', by, title, attendees };
    this.bookings.update((l) => [b, ...l]);
    return b;
  }
  roomFree(r: Room, date: string, from: string, to: string, ignore?: string) {
    const a = toMin(from), z = toMin(to);
    return !this.bookings().some((b) => b.resourceId === r.id && b.id !== ignore && b.date === date && b.status !== 'Cancelled' && b.status !== 'Rejected' && toMin(b.from) < z && toMin(b.to) > a);
  }
  bookBay(bay: Bay, date: string, from: string, to: string) {
    if (date === TODAY) this.bays.update((l) => l.map((x) => (x.id === bay.id ? { ...x, status: 'reserved', mine: true, plate: 'Dubai A 48213' } : x)));
    const b: Booking = { id: this.nextId(), kind: 'Parking', resource: `Bay ${bay.level}-${bay.row}${bay.n}`, resourceId: bay.id, location: `${bay.site} - Level ${bay.level}`, date, from, to, status: 'Confirmed', by: ME };
    this.bookings.update((l) => [b, ...l]);
    return b;
  }
  bookAsset(a: Asset, date: string, from: string, to: string, qty = 1) {
    this.assets.update((l) => l.map((x) => (x.id === a.id ? { ...x, reservedToday: x.reservedToday + (date === TODAY ? qty : 0) } : x)));
    const b: Booking = { id: this.nextId(), kind: 'Asset', resource: qty > 1 ? `${a.name} ×${qty}` : a.name, resourceId: a.id, location: `${a.site} - Equipment Store`, date, from, to, status: a.deposit ? 'Pending' : 'Confirmed', by: ME };
    this.bookings.update((l) => [b, ...l]);
    return b;
  }
  cancel(id: string) {
    const b = this.bookings().find((x) => x.id === id);
    if (!b) return;
    this.bookings.update((l) => l.map((x) => (x.id === id ? { ...x, status: 'Cancelled' } : x)));
    if (b.date === TODAY) {
      this.desks.update((l) => l.map((d) => (d.id === b.resourceId && d.mine ? { ...d, status: 'available', mine: false, occupant: undefined, until: undefined } : d)));
      this.bays.update((l) => l.map((x) => (x.id === b.resourceId && x.mine ? { ...x, status: 'available', mine: false, plate: undefined } : x)));
    }
  }
  updateBooking(id: string, ch: Partial<Booking>) {
    this.bookings.update((l) => l.map((x) => (x.id === id ? { ...x, ...ch } : x)));
  }
  checkIn(id: string) {
    this.updateBooking(id, { status: 'Checked In' });
  }
  setDeskStatus(id: string, status: DeskStatus) {
    this.desks.update((l) => l.map((d) => (d.id === id ? { ...d, status, mine: false, occupant: status === 'occupied' ? d.occupant ?? NAMES[3] : undefined } : d)));
  }

  addRequest(q: Partial<Request> & Pick<Request, 'title' | 'category' | 'priority'>) {
    const isWo = q.kind === 'Maintenance';
    const n = this.requests().filter((x) => (isWo ? x.kind === 'Maintenance' : x.kind !== 'Maintenance')).length;
    const req: Request = { id: isWo ? `WO-2026-${String(900 + n).padStart(4, '0')}` : `FR-2026-${String(1560 + n).padStart(4, '0')}`, kind: 'Facility', site: 'Head Office', location: 'Head Office - Floor 5', status: 'Open', requester: ME, assignee: 'Unassigned', createdH: 0, slaH: SLA_HOURS[q.priority], notes: [{ at: 'Just now', by: ME, text: 'Request raised via People360 portal.' }], ...q };
    this.requests.update((l) => [req, ...l]);
    return req;
  }
  patchRequest(id: string, ch: Partial<Request>, note?: string) {
    this.requests.update((l) => l.map((q) => (q.id === id ? { ...q, ...ch, notes: note ? [{ at: 'Just now', by: ME, text: note }, ...q.notes] : q.notes } : q)));
  }
  addCleaning(area: string, site: string, floor: string, time: string) {
    this.cleaning.update((l) => [...l, { id: `HK-${String(l.length + 1).padStart(3, '0')}`, task: 'Desk sanitization', area, site, floor, time, staff: CLEANERS[l.length % CLEANERS.length], status: 'Pending', checklist: CLEAN_DEF[0][2].map((item) => ({ item, done: false })), trigger: 'Post-booking' }]);
  }
  patchCleaning(id: string, ch: Partial<CleanTask>) {
    this.cleaning.update((l) => l.map((t) => (t.id === id ? { ...t, ...ch } : t)));
  }
  reset() {
    this.desks.set(buildDesks());
    this.bookings.set(seedBookings());
    this.bays.set(buildBays());
    this.assets.set(ASSETS.map((a) => ({ ...a })));
    this.requests.set(seedRequests());
    this.cleaning.set(seedCleaning());
  }
}
