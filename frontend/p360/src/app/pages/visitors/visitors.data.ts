// Shared hard-coded data for Visitor Management.
import { rng } from '../dashboards/demo-data';
import { PEOPLE } from '../people/people.data';

export type VStatus = 'Expected' | 'Pending Approval' | 'Checked In' | 'Checked Out' | 'Rejected' | 'No-show';
export interface Visit {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  email: string;
  phone: string;
  company: string;
  type: string;
  purpose: string;
  host: string;
  hostDept: string;
  site: string;
  location: string;
  expected: number;
  checkIn: number | null;
  checkOut: number | null;
  status: VStatus;
  method: string;
  vehicle: string;
  badge: string;
  idType: string;
  nda: boolean;
  escort: boolean;
}

export const TYPES = ['Business Meeting', 'Contractor', 'Delivery', 'Interview', 'Service & Maintenance', 'Others'];
export const TYPE_COUNTS = [68, 28, 20, 14, 12, 10];
export const TYPE_COLORS = ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-f59e0b)', 'var(--ka-22c55e)', 'var(--ka-f97316)', 'var(--ka-ef4444)'];
export const PURPOSES = ['Business Meeting', 'Delivery', 'Interview', 'Service & Maintenance', 'Training', 'Event', 'Site Visit', 'Others'];
export const METHODS = ['Pre-Registered', 'Walk-in', 'Invited by Employee', 'Contractor Portal'];
export const METHOD_COUNTS = [82, 38, 24, 8];
export const METHOD_COLORS = ['var(--ka-8b5cf6)', 'var(--ka-3b82f6)', 'var(--ka-f59e0b)', 'var(--ka-ef4444)'];
export const COMPANIES = ['Tech Solutions', 'Gulf Logistics', 'ABC Contractors', 'Global IT', 'Facility Services', 'SecureTech', 'EduTech', 'DHL', 'Aramex', 'Acme Corp', 'Globex', 'Initech', 'Stark Industries', 'Emirates NBD', 'PwC', 'Siemens'];
export const HOSTS = ['Priya Sharma', 'Ahmed Hassan', 'Ramesh Kumar', 'Li Wei', 'Fatima Ali', 'Mohammed Ali', 'Arjun Mehta', 'David Lee', 'Sophie Martin', 'Chen Wei', 'Omar Khalid', 'Grace Park'];
const HOST_DEPT: Record<string, string> = { 'Priya Sharma': 'HR', 'Ahmed Hassan': 'Logistics', 'Ramesh Kumar': 'Facilities', 'Li Wei': 'R&D', 'Fatima Ali': 'Operations', 'Mohammed Ali': 'Operations', 'Arjun Mehta': 'IT', 'David Lee': 'Sales', 'Sophie Martin': 'Marketing', 'Chen Wei': 'R&D', 'Omar Khalid': 'Executive', 'Grace Park': 'Facilities' };
export const hostDept = (h: string) => HOST_DEPT[h] ?? 'General';
const LOCATIONS = ['Main Building - Floor 3', 'Main Building - Floor 1', 'Reception', 'Warehouse - Dock 2', 'HR Department', 'Meeting Room 5A', 'Training Center', 'Plant - Gate 2'];

const AV = ['var(--ka-a16207)', 'var(--ka-be185d)', 'var(--ka-475569)', 'var(--ka-9333ea)', 'var(--ka-0d9488)', 'var(--ka-b45309)', 'var(--ka-7c3aed)', 'var(--ka-2563eb)'];
const ini = (n: string) => n.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
const plate = (r: () => number) => `${'ABCDEFGHJKLMNP'[Math.floor(r() * 14)]}${r() < 0.4 ? 'ABKM'[Math.floor(r() * 4)] : ''} ${10000 + Math.floor(r() * 89999)}`;

// [name, company, purpose, host, status, minutes ago]
const FEATURED: [string, string, string, string, VStatus, number][] = [
  ['Arjun Mehta', 'Tech Solutions', 'Business Meeting', 'Priya Sharma', 'Checked In', 0],
  ['Sarah Khan', 'Gulf Logistics', 'Delivery', 'Ahmed Hassan', 'Checked In', 3],
  ['David Lee', 'ABC Contractors', 'Site Visit', 'Ramesh Kumar', 'Pending Approval', 6],
  ['Maria Santos', 'Global IT', 'Interview', 'Li Wei', 'Checked In', 9],
  ['Chen Wei', 'Facility Services', 'Service & Maintenance', 'Fatima Ali', 'Checked In', 12],
  ['Ahmed Raza', 'SecureTech', 'Business Meeting', 'Priya Sharma', 'Checked Out', 14],
  ['Priya Nair', 'EduTech', 'Training', 'Mohammed Ali', 'Checked In', 16],
  ['James Wilson', 'DHL', 'Delivery', 'Ahmad Hassan', 'Checked In', 19],
];
const typeFor = (purpose: string) => (purpose === 'Site Visit' ? 'Contractor' : purpose === 'Training' || purpose === 'Event' ? 'Others' : TYPES.includes(purpose) ? purpose : 'Business Meeting');

function makeVisit(i: number, name: string, company: string, purpose: string, host: string, status: VStatus, expected: number, r: () => number, method?: string): Visit {
  const checkIn = status === 'Checked In' || status === 'Checked Out' ? expected + Math.floor((r() - 0.3) * 20) * 60000 : null;
  return {
    id: `VIS-${String(26000 + i)}`, name, initials: ini(name), avatar: AV[i % AV.length],
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${company.toLowerCase().replace(/[^a-z]+/g, '')}.com`,
    phone: `+971 5${Math.floor(r() * 9)} ${100 + Math.floor(r() * 899)} ${1000 + Math.floor(r() * 8999)}`,
    company, type: typeFor(purpose), purpose, host, hostDept: hostDept(host), site: r() < 0.7 ? 'Head Office' : r() < 0.6 ? 'Manufacturing' : 'Warehouse',
    location: LOCATIONS[Math.floor(r() * LOCATIONS.length)], expected, checkIn,
    checkOut: status === 'Checked Out' && checkIn ? checkIn + (30 + Math.floor(r() * 150)) * 60000 : null,
    status, method: method ?? METHODS[Math.floor(r() * 4)], vehicle: r() < 0.35 ? plate(r) : '', badge: checkIn ? `VB-${String(4000 + i)}` : '',
    idType: ['Emirates ID', 'Passport', 'Driving Licence'][Math.floor(r() * 3)], nda: r() < 0.7, escort: purpose === 'Site Visit' || purpose === 'Service & Maintenance',
  };
}

/** Today's 152 visits: 86 on site, 32 checked out, 26 expected, 8 pending approval. */
export const TODAY_VISITS: Visit[] = (() => {
  const r = rng(152);
  const now = Date.now();
  const out: Visit[] = FEATURED.map(([n, c, p, h, s, ago], i) => makeVisit(i, n, c, p, h, s, now - ago * 60000 - (s === 'Checked Out' ? 90 * 60000 : 0), r, i % 3 === 0 ? 'Pre-Registered' : i % 3 === 1 ? 'Walk-in' : 'Invited by Employee'));
  out.forEach((v, i) => {
    if (FEATURED[i][4] === 'Checked In') v.checkIn = now - FEATURED[i][5] * 60000;
    if (v.status === 'Checked Out') {
      v.checkIn = now - 3 * 3600000;
      v.checkOut = now - FEATURED[i][5] * 60000;
    }
  });
  // remaining buckets
  const need: [VStatus, number][] = [['Checked In', 86 - 6], ['Checked Out', 32 - 1], ['Expected', 26], ['Pending Approval', 8 - 1]];
  // type quota to match the design (68/28/20/14/12/10)
  const quota = [...TYPE_COUNTS];
  out.forEach((v) => quota[TYPES.indexOf(v.type)]--);
  const typePool: string[] = quota.flatMap((n, i) => Array(Math.max(0, n)).fill(TYPES[i]));
  // Contractor visits split into training / events / site visits so purposes match the design (≈6.8% / 5.3% / 13.1% others).
  let cIdx = 0;
  const purposeOf = (t: string) => {
    if (t !== 'Contractor') return t;
    const k = cIdx++ % 3;
    return k === 0 ? 'Site Visit' : k === 1 ? 'Training' : 'Event';
  };
  const names = PEOPLE.slice(3000, 3400).map((p) => p.name);
  let i = out.length;
  for (const [status, n] of need)
    for (let k = 0; k < n; k++) {
      const t = typePool.splice(Math.floor(r() * typePool.length), 1)[0] ?? 'Business Meeting';
      const expected = status === 'Expected' ? now + (k < 12 ? 5 + k * 5 : 90 + k * 20) * 60000 : now - (20 + Math.floor(r() * 360)) * 60000;
      const v = makeVisit(i, names[i], COMPANIES[Math.floor(r() * COMPANIES.length)], purposeOf(t), HOSTS[Math.floor(r() * HOSTS.length)], status, expected, r);
      v.type = t; // keep the visitor type quota independent of the purpose
      out.push(v);
      i++;
    }
  // check-in method quota 82/38/24/8
  const mq = [...METHOD_COUNTS];
  out.forEach((v) => mq[METHODS.indexOf(v.method)]--);
  const fix = out.filter((v) => mq[METHODS.indexOf(v.method)] < 0);
  for (const v of fix) {
    const j = mq.findIndex((n) => n > 0);
    if (j < 0) break;
    mq[METHODS.indexOf(v.method)]++;
    v.method = METHODS[j];
    mq[j]--;
  }
  return out;
})();

/** 90-day visit history (closed visits). */
export const HISTORY_VISITS: Visit[] = (() => {
  const r = rng(9090);
  const names = PEOPLE.slice(3400, 4200).map((p) => p.name);
  const start = new Date().setHours(0, 0, 0, 0);
  return Array.from({ length: 3200 }, (_, i) => {
    const day = 1 + Math.floor(r() * 89);
    const t = start - day * 86400000 + (8 + r() * 9) * 3600000;
    const d = new Date(t).getDay();
    const status: VStatus = r() < 0.94 ? 'Checked Out' : r() < 0.6 ? 'No-show' : 'Rejected';
    const p = PURPOSES[Math.floor(Math.pow(r(), 1.8) * PURPOSES.length)];
    const v = makeVisit(30000 + i, names[i % names.length], COMPANIES[Math.floor(r() * COMPANIES.length)], p, HOSTS[Math.floor(r() * HOSTS.length)], status, t, r);
    return d === 0 || d === 6 ? { ...v, purpose: 'Delivery', type: 'Delivery' } : v;
  }).sort((a, b) => b.expected - a.expected);
})();

/* ---------- Vehicles ---------- */
export interface Vehicle {
  id: string;
  time: number;
  plate: string;
  driver: string;
  type: string;
  company: string;
  zone: string;
  status: 'In' | 'Out';
  outTime: number | null;
}
export const VEHICLES: Vehicle[] = (() => {
  const r = rng(321);
  const now = Date.now();
  const seed: [number, string, string, string, 'In' | 'Out'][] = [
    [2, 'D 54721', 'Ali Khan', 'Car', 'In'], [6, 'AB 12345', 'Ramesh', 'Truck', 'In'], [39, 'C 98217', 'John', 'Van', 'Out'], [64, 'K 66543', 'Faisal', 'Car', 'In'],
  ];
  const out: Vehicle[] = seed.map(([ago, plate, driver, type, status], i) => ({ id: `VH-${100 + i}`, time: now - ago * 60000, plate, driver, type, company: COMPANIES[i], zone: type === 'Truck' ? 'Loading Bay' : 'Visitor Parking P1', status, outTime: status === 'Out' ? now - 5 * 60000 : null }));
  for (let i = 4; i < 42; i++) {
    const ago = 70 + Math.floor(r() * 300);
    const st: 'In' | 'Out' = r() < 0.55 ? 'In' : 'Out';
    const type = ['Car', 'Car', 'Car', 'Van', 'Truck', 'Motorbike'][Math.floor(r() * 6)];
    out.push({ id: `VH-${100 + i}`, time: now - ago * 60000, plate: plate(r), driver: PEOPLE[3500 + i].name.split(' ')[0], type, company: COMPANIES[Math.floor(r() * COMPANIES.length)], zone: type === 'Truck' || type === 'Van' ? 'Loading Bay' : 'Visitor Parking P1', status: st, outTime: st === 'Out' ? now - Math.floor(r() * ago) * 60000 : null });
  }
  return out;
})();

/* ---------- Watchlist ---------- */
export interface WatchEntry {
  id: string;
  name: string;
  initials: string;
  type: 'Blacklist' | 'Watchlist' | 'VIP alert';
  reason: string;
  idNumber: string;
  addedBy: string;
  added: string;
  expiry: string;
  matches: number;
}
export const WATCHLIST: WatchEntry[] = [
  ['Victor Kane', 'Blacklist', 'Theft of equipment (2025)', 'P8823411', 'Security', '2025-11-02', '', 3],
  ['Rana Malik', 'Blacklist', 'Aggressive behaviour at reception', '784-1988-3321', 'Security', '2026-02-14', '', 1],
  ['Tom Fletcher', 'Watchlist', 'Former employee – terminated', '784-1990-1182', 'HR', '2026-06-01', '2027-06-01', 2],
  ['Lena Ortiz', 'Watchlist', 'Unpaid contractor dispute', 'P5521098', 'Procurement', '2026-08-19', '2026-12-31', 0],
  ['Sheikh Abdullah Al Nahyan', 'VIP alert', 'Protocol – notify CEO office on arrival', 'VIP-001', 'Executive Office', '2026-01-01', '', 4],
  ['Mark Daniels', 'Blacklist', 'Attempted tailgating into server room', 'P7712093', 'Security', '2026-09-03', '', 1],
  ['Hiro Tanaka', 'VIP alert', 'Board member – escort from lobby', 'VIP-014', 'Executive Office', '2026-03-10', '', 2],
  ['Peter Novak', 'Watchlist', 'Competitor employee – no lab access', 'P3398120', 'Legal', '2026-07-22', '2027-01-22', 0],
  ['Sara Lindqvist', 'Watchlist', 'Pending background check', '784-1995-0091', 'Security', '2026-10-30', '2026-11-30', 0],
  ['Imran Qadir', 'Blacklist', 'Fraudulent delivery documents', '784-1984-7755', 'Security', '2026-04-18', '', 2],
].map(([name, type, reason, idNumber, addedBy, added, expiry, matches], i) => ({
  id: `WL-${300 + i}`, name: name as string, initials: ini(name as string), type: type as WatchEntry['type'], reason: reason as string, idNumber: idNumber as string,
  addedBy: addedBy as string, added: added as string, expiry: expiry as string, matches: matches as number,
}));

export const fmtTime = (ts: number | null) => (ts ? new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—');
export const duration = (from: number | null, to = Date.now()) => {
  if (!from) return '—';
  const m = Math.max(0, Math.round((to - from) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};
export { makeVisit };
