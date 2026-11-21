// Page data for Emergency Visitor Accountability (reference image: emergency-visitor-accountability.png).
// 86 visitors on site: 58 at a muster point, 14 accounted elsewhere, 14 unaccounted.
// Muster A 38 (32 accounted), B 27 (20), C 21 (20).
import { AREAS, HOSTS, SITES, VISITOR_TYPES } from './vm.data';

export type AccStatus = 'Accounted' | 'At Muster Point' | 'Unaccounted';
export type Muster = 'A' | 'B' | 'C';
export interface AccRow {
  id: string;
  name: string;
  company: string;
  host: string;
  location: string;
  site: string;
  type: string;
  status: AccStatus;
  /** minutes since last badge scan / sighting */
  ago: number;
  muster: Muster;
  escalated?: boolean;
}
export interface LogRow { at: number; event: string; details: string; kind: 'fire' | 'start' | 'muster' | 'security' | 'scan' | 'broadcast' | 'accounted' | 'escalate' | 'clear' }

export const NOW = 624; // 10:24 AM
export const MUSTERS: { id: Muster; name: string; area: string }[] = [
  { id: 'A', name: 'Muster Point A', area: 'North Lawn' },
  { id: 'B', name: 'Muster Point B', area: 'West Car Park' },
  { id: 'C', name: 'Muster Point C', area: 'East Plaza' },
];

const CAST: Omit<AccRow, 'site' | 'type'>[] = [
  { id: 'VIS-000784', name: 'Arjun Mehta', company: 'Tech Solutions', host: 'Priya Sharma', location: 'Meeting Rooms – 3F', status: 'Accounted', ago: 2, muster: 'A' },
  { id: 'VIS-000783', name: 'Maria Santos', company: 'Global IT', host: 'Li Wei', location: 'Visitor Lounge', status: 'At Muster Point', ago: 4, muster: 'A' },
  { id: 'VIS-000782', name: 'David Lee', company: 'ABC Contractors', host: 'Ramesh Kumar', location: 'Restricted Zone', status: 'Unaccounted', ago: 12, muster: 'A' },
  { id: 'VIS-000781', name: 'Sarah Khan', company: 'Gulf Logistics', host: 'Ahmed Hassan', location: 'Main Entrance', status: 'Accounted', ago: 1, muster: 'B' },
  { id: 'VIS-000778', name: 'Chen Wei', company: 'Facility Services', host: 'Fatima Ali', location: 'Plant Site – North Block', status: 'Unaccounted', ago: 9, muster: 'B' },
  { id: 'VIS-000776', name: 'Alex Brown', company: 'Vertex Systems', host: 'Michael Chen', location: 'Executive Floor', status: 'Unaccounted', ago: 15, muster: 'A' },
];
const FIRST = ['Rohan', 'Aisha', 'Vikram', 'Neha', 'Karan', 'Meera', 'Omar', 'Hana', 'Rahul', 'Sara', 'Imran', 'Emily', 'Tom', 'Nadia', 'Yusuf', 'Olivia', 'Sanjay', 'Layla', 'Daniel', 'Grace', 'Faisal', 'Anil', 'Zara', 'Ken'];
const LAST = ['Verma', 'Noor', 'Iyer', 'Gupta', 'Malik', 'Clark', 'Yusuf', 'Brown', 'Nair', 'Ahmed', 'Kapoor', 'Wong', 'Patel', 'Karim', 'Singh', 'Das'];
const COS = ['Tech Solutions', 'Gulf Logistics', 'ABC Contractors', 'Global IT', 'Facility Services', 'SecureTech', 'Vertex Systems', 'Purple Holdings', 'Global Ventures', 'Blue Dart', 'Siemens', 'PwC', 'DHL', 'Infosys'];
const LOCS = ['Main Entrance', 'Reception', 'Meeting Rooms – 3F', 'Visitor Lounge', 'Executive Floor', 'Boardroom', 'Cafeteria', 'Parking Gate', 'Plant Site – North Block'];
export const ZONES = [...new Set([...LOCS, 'Restricted Zone', ...AREAS])];

export function seedRows(): AccRow[] {
  let s = 86;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const siteOf = (loc: string) => (loc.startsWith('Plant') ? SITES[3] : SITES[0]);
  const out: AccRow[] = CAST.map((c, i) => ({ ...c, site: siteOf(c.location), type: i === 2 || i === 4 ? 'Contractor' : i === 3 ? 'Delivery' : 'Business Visitor' }));
  // remaining unaccounted (11) with muster mix so totals are A 6, B 7, C 1
  const unM: Muster[] = ['B', 'A', 'B', 'A', 'B', 'A', 'B', 'B', 'A', 'B', 'C'];
  // remaining accounted: A 32-2=30 (Arjun, Maria), B 20-1=19 (Sarah), C 20 → 69; 12 accounted-elsewhere + 57 at muster
  const accM: Muster[] = [...Array(30).fill('A'), ...Array(19).fill('B'), ...Array(20).fill('C')];
  for (let i = accM.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [accM[i], accM[j]] = [accM[j], accM[i]]; }
  const used = new Set(out.map((o) => o.name));
  const mk = (status: AccStatus, muster: Muster, n: number): AccRow => {
    let name = '';
    do name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`; while (used.has(name));
    used.add(name);
    const location = LOCS[Math.floor(r() * LOCS.length)];
    return {
      id: `VIS-${String(770 - n).padStart(6, '0')}`, name, company: COS[Math.floor(r() * COS.length)], host: HOSTS[Math.floor(r() * 7)].name,
      location, site: siteOf(location), type: VISITOR_TYPES[Math.floor(r() * 6)], status, muster,
      ago: status === 'Unaccounted' ? 8 + Math.floor(r() * 14) : 1 + Math.floor(r() * 9),
    };
  };
  let n = 0;
  unM.forEach((m) => out.push(mk('Unaccounted', m, n++)));
  accM.forEach((m, i) => out.push(mk(i < 12 ? 'Accounted' : 'At Muster Point', m, n++)));
  return out;
}

export const LOG_SEED: LogRow[] = [
  { at: 632, event: 'Last badge scan recorded', details: 'Visitor Maria Santos (VIS-000783) scanned at Muster Point A.', kind: 'scan' },
  { at: 626, event: 'Security team notified', details: 'Security operations team alerted and dispatched to affected areas.', kind: 'security' },
  { at: 625, event: 'Muster Point A activated', details: 'Muster Point A (North Lawn) activated and receiving visitors.', kind: 'muster' },
  { at: 624, event: 'Accountability started by Priya Sharma', details: 'Emergency visitor accountability initiated for Main Campus – Tower A.', kind: 'start' },
  { at: 624, event: 'Fire alarm triggered', details: 'Fire alarm activated at Main Campus – Tower A.', kind: 'fire' },
];

export const RESPONSE_TEAM = ['Security Operations', 'Facilities & Safety', 'Workplace Operations', 'IT & Communications'];
