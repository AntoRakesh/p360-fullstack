// Hard-coded Security Patrol & Guard Management dataset + a root store shared by all patrol pages.
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { rng } from '@p360/shared/data/demo-data';
import { MapZone } from '@p360/shared/visuals/floor-plan';

export type GStatus = 'On Duty' | 'Off Duty' | 'On Leave' | 'Training';
export type ShiftKey = 'Day' | 'Evening' | 'Night' | 'Rotational';
export type CStatus = 'Valid' | 'Expiring Soon' | 'Expired';

export interface CertType {
  key: string;
  name: string;
  color: string;
  shape: 'shield' | 'circle';
  icon: string;
  validity: number; // months
  mandatory: boolean;
}
export interface GCert {
  key: string;
  no: string;
  issued: string;
  expiry: string;
  status: CStatus;
}
export interface Guard {
  id: string;
  name: string;
  gender: 'M' | 'F';
  tone: number;
  company: string;
  site: string;
  location: string;
  post: string;
  status: GStatus;
  shift: ShiftKey | null;
  mobile: string;
  email: string;
  designation: string;
  reportingTo: string;
  dob: string;
  joinDate: string;
  nationality: string;
  certs: GCert[];
  since: string;
  sinceMins: number;
  lastCheckin: string;
  rating: number;
  compliance: number;
  scans: number;
  response: number;
  attendance: number;
  incidents: number;
}

export const CERT_TYPES: CertType[] = [
  { key: 'sira', name: 'SIRA Security License', color: 'var(--ka-ef4444)', shape: 'shield', icon: 'shield-check', validity: 24, mandatory: true },
  { key: 'cctv', name: 'CCTV Operator Certificate', color: 'var(--ka-3b82f6)', shape: 'circle', icon: 'eye', validity: 24, mandatory: false },
  { key: 'firstaid', name: 'First Aid Certification', color: 'var(--ka-22c55e)', shape: 'circle', icon: 'plus', validity: 24, mandatory: true },
  { key: 'fire', name: 'Fire Safety Training', color: 'var(--ka-f43f5e)', shape: 'circle', icon: 'flame', validity: 12, mandatory: true },
  { key: 'health', name: 'Health & Fitness Certificate', color: 'var(--ka-f59e0b)', shape: 'shield', icon: 'heart', validity: 12, mandatory: true },
  { key: 'crowd', name: 'Crowd Management', color: 'var(--ka-7c3aed)', shape: 'shield', icon: 'users', validity: 36, mandatory: false },
  { key: 'tactics', name: 'Defensive Tactics', color: 'var(--ka-2563eb)', shape: 'circle', icon: 'star', validity: 24, mandatory: false },
];
export const certType = (k: string) => CERT_TYPES.find((c) => c.key === k)!;

export const SHIFTS: Record<ShiftKey, { label: string; time: string; color: string; code: string }> = {
  Day: { label: 'Day Shift', time: '06:00 - 14:00', color: 'var(--ka-f59e0b)', code: 'D' },
  Evening: { label: 'Evening Shift', time: '14:00 - 22:00', color: 'var(--ka-8b5cf6)', code: 'E' },
  Night: { label: 'Night Shift', time: '22:00 - 06:00', color: 'var(--ka-3b82f6)', code: 'N' },
  Rotational: { label: 'Rotational', time: '', color: 'var(--ka-14b8a6)', code: 'R' },
};

export interface SecCompany {
  name: string;
  short: string;
  color: string;
  guards: number;
  type: 'Contract' | 'Licensed Vendor';
  contractNo: string;
  start: string;
  end: string;
  rate: number;
  monthly: number;
  sla: number;
  slaTarget: number;
  contact: string;
  phone: string;
  email: string;
  license: string;
  licenseExpiry: string;
  rating: number;
  status: 'Active' | 'Under Review' | 'Renewal Due';
}
export const SEC_COMPANIES: SecCompany[] = [
  { name: 'SecureTech', short: 'ST', color: 'var(--ka-7c3aed)', guards: 96, type: 'Contract', contractNo: 'SC-2024-011', start: '2024-01-01', end: '2027-12-31', rate: 38, monthly: 612000, sla: 97.4, slaTarget: 95, contact: 'Omar Haddad', phone: '+971 4 331 2200', email: 'ops@securetech.ae', license: 'SIRA-CO-1182', licenseExpiry: '2027-06-30', rating: 4.6, status: 'Active' },
  { name: 'Falcon Security', short: 'FS', color: 'var(--ka-2563eb)', guards: 68, type: 'Contract', contractNo: 'SC-2023-027', start: '2023-07-01', end: '2026-12-31', rate: 36, monthly: 412000, sla: 94.1, slaTarget: 95, contact: 'Grace Park', phone: '+971 4 288 9010', email: 'control@falconsec.ae', license: 'SIRA-CO-0947', licenseExpiry: '2027-02-28', rating: 4.2, status: 'Renewal Due' },
  { name: 'Alpha Security', short: 'AS', color: 'var(--ka-0d9488)', guards: 52, type: 'Contract', contractNo: 'SC-2025-004', start: '2025-03-01', end: '2028-02-29', rate: 35, monthly: 305000, sla: 96.2, slaTarget: 95, contact: 'Ravi Shankar', phone: '+971 4 445 1180', email: 'hello@alphasecurity.ae', license: 'SIRA-CO-1420', licenseExpiry: '2027-09-30', rating: 4.4, status: 'Active' },
  { name: 'Guardian Shield', short: 'GS', color: 'var(--ka-ea580c)', guards: 20, type: 'Licensed Vendor', contractNo: 'SC-2026-002', start: '2026-02-01', end: '2027-01-31', rate: 40, monthly: 132000, sla: 91.8, slaTarget: 95, contact: 'Layla Haddad', phone: '+971 4 512 7700', email: 'desk@guardianshield.ae', license: 'SIRA-CO-1566', licenseExpiry: '2026-12-15', rating: 3.9, status: 'Under Review' },
  { name: 'Eagle Eye Services', short: 'EE', color: 'var(--ka-db2777)', guards: 12, type: 'Licensed Vendor', contractNo: 'SC-2026-009', start: '2026-06-01', end: '2027-05-31', rate: 42, monthly: 83000, sla: 98.1, slaTarget: 95, contact: 'Kenji Sato', phone: '+971 4 360 4411', email: 'ops@eagleeye.ae', license: 'SIRA-CO-1603', licenseExpiry: '2028-01-31', rating: 4.7, status: 'Active' },
];
export const COMPANY_NAMES = SEC_COMPANIES.map((c) => c.name);
export const companyColor = (n: string) => SEC_COMPANIES.find((c) => c.name === n)?.color ?? 'var(--ka-64748b)';

/* ---------- Site & posts (campus map 1000 × 560) ---------- */
export const SITE_NAMES = ['Head Office', 'Manufacturing Plant', 'Warehouse', 'Logistics Hub', 'Data Center'];
export interface Post {
  id: string;
  name: string;
  site: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  required: number;
  risk: 'High' | 'Medium' | 'Low';
}
export const POSTS: Post[] = [
  { id: 'wg', name: 'West Gate', site: 'Head Office', x: 40, y: 40, w: 100, h: 150, color: 'var(--ka-3b82f6)', required: 3, risk: 'Medium' },
  { id: 'ho', name: 'Head Office', site: 'Head Office', x: 150, y: 40, w: 220, h: 150, color: 'var(--ka-7c3aed)', required: 8, risk: 'Medium' },
  { id: 'ew', name: 'East Wing', site: 'Head Office', x: 380, y: 40, w: 160, h: 150, color: 'var(--ka-8b5cf6)', required: 4, risk: 'Low' },
  { id: 'dc', name: 'Data Center', site: 'Data Center', x: 560, y: 40, w: 160, h: 150, color: 'var(--ka-ef4444)', required: 6, risk: 'High' },
  { id: 'sh', name: 'Server Hall', site: 'Data Center', x: 730, y: 40, w: 120, h: 150, color: 'var(--ka-f43f5e)', required: 3, risk: 'High' },
  { id: 'mg', name: 'Main Gate', site: 'Head Office', x: 40, y: 210, w: 100, h: 150, color: 'var(--ka-3b82f6)', required: 6, risk: 'High' },
  { id: 'rc', name: 'Reception', site: 'Head Office', x: 150, y: 210, w: 110, h: 150, color: 'var(--ka-8b5cf6)', required: 3, risk: 'Low' },
  { id: 'pk', name: 'Parking Area', site: 'Head Office', x: 270, y: 210, w: 270, h: 150, color: 'var(--ka-94a3b8)', required: 5, risk: 'Medium' },
  { id: 'pa', name: 'Production Area', site: 'Manufacturing Plant', x: 560, y: 210, w: 290, h: 150, color: 'var(--ka-f59e0b)', required: 9, risk: 'Medium' },
  { id: 'cr', name: 'Control Room', site: 'Head Office', x: 860, y: 40, w: 100, h: 320, color: 'var(--ka-22c55e)', required: 4, risk: 'High' },
  { id: 'me', name: 'Main Entrance', site: 'Manufacturing Plant', x: 40, y: 380, w: 100, h: 150, color: 'var(--ka-3b82f6)', required: 4, risk: 'Medium' },
  { id: 'wh', name: 'Warehouse', site: 'Warehouse', x: 150, y: 380, w: 220, h: 150, color: 'var(--ka-0d9488)', required: 7, risk: 'Medium' },
  { id: 'cs', name: 'Cold Store', site: 'Warehouse', x: 380, y: 380, w: 160, h: 150, color: 'var(--ka-06b6d4)', required: 2, risk: 'Low' },
  { id: 'lb', name: 'Loading Bay', site: 'Manufacturing Plant', x: 560, y: 380, w: 130, h: 150, color: 'var(--ka-f97316)', required: 3, risk: 'Medium' },
  { id: 'ly', name: 'Logistics Yard', site: 'Logistics Hub', x: 700, y: 380, w: 150, h: 150, color: 'var(--ka-ea580c)', required: 5, risk: 'Medium' },
  { id: 'fg', name: 'Fleet Gate', site: 'Logistics Hub', x: 860, y: 380, w: 100, h: 150, color: 'var(--ka-3b82f6)', required: 3, risk: 'Medium' },
];
export const postByName = (n: string) => POSTS.find((p) => p.name === n) ?? POSTS[1];
export const POST_ZONES: MapZone[] = POSTS.map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, w: p.w, h: p.h, color: p.color, fill: 0.12, kind: p.id === 'pk' || p.id === 'ly' ? 'open' : undefined }));

/* ---------- Guards ---------- */
const FIRST_M = ['Ahmed', 'Ramesh', 'Ali', 'Chen', 'David', 'James', 'Mohammed', 'Omar', 'Yusuf', 'Rahul', 'Vikram', 'Ibrahim', 'Daniel', 'Kenji', 'Lucas', 'Ravi', 'Tariq', 'Samuel', 'Hamza', 'Joseph', 'Suresh', 'Khalid', 'Imran', 'Peter', 'Bilal', 'Anil', 'Faisal', 'George'];
const FIRST_F = ['Priya', 'Maria', 'Fatima', 'Aisha', 'Grace', 'Sara', 'Nadia', 'Layla', 'Meera', 'Zara', 'Sofia', 'Hannah'];
const LAST = ['Hassan', 'Sharma', 'Kumar', 'Khan', 'Santos', 'Wei', 'Lee', 'Ali', 'Wilson', 'Said', 'Rahman', 'Nair', 'Haddad', 'Iyer', 'Mensah', 'Okafor', 'Silva', 'Pillai', 'Qureshi', 'Fernandes', 'Thomas', 'Mathew', 'Bello', 'Abdullah', 'Rao', 'Das', 'Mehta', 'Joseph'];
const NATS = ['UAE', 'India', 'Pakistan', 'Philippines', 'Nepal', 'Kenya', 'Egypt', 'Sri Lanka', 'Uganda', 'Ghana', 'Bangladesh', 'Nigeria'];
const SUPERVISORS = ['Site Supervisor', 'Shift Supervisor', 'Security Manager', 'Control Room Lead'];

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtD(s: string) {
  if (!s) return '-';
  const [y, m, d] = s.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MON[m - 1]} ${y}`;
}
export const hash = (s: string) => [...s].reduce((x, c) => (x * 31 + c.charCodeAt(0)) | 0, 7);
export const initials = (n: string) => n.split(' ').map((x) => x[0]).slice(0, 2).join('');

type Seed = [string, 'M' | 'F', string, string, GStatus, ShiftKey | null, number, string];
// The 10 guards shown in the reference image.
const IMAGE_SEED: Seed[] = [
  ['Ahmed Hassan', 'M', 'SecureTech', 'Head Office', 'On Duty', 'Day', 2, 'sira,cctv,firstaid,fire,health'],
  ['Priya Sharma', 'F', 'SecureTech', 'Main Gate', 'On Duty', 'Day', 1, 'health,firstaid,cctv,sira'],
  ['Ramesh Kumar', 'M', 'Falcon Security', 'Warehouse', 'Off Duty', 'Night', 3, 'sira,crowd,tactics,firstaid,fire'],
  ['Ali Khan', 'M', 'SecureTech', 'Production Area', 'On Duty', 'Day', 2, 'cctv,crowd,tactics,sira,firstaid,fire'],
  ['Maria Santos', 'F', 'Alpha Security', 'Main Entrance', 'On Leave', null, 1, 'firstaid,health,cctv,sira'],
  ['Chen Wei', 'M', 'SecureTech', 'Parking Area', 'On Duty', 'Night', 0, 'health,crowd,tactics,sira,firstaid'],
  ['David Lee', 'M', 'Falcon Security', 'Data Center', 'Off Duty', 'Rotational', 0, 'sira,health,cctv,firstaid'],
  ['Fatima Ali', 'F', 'Alpha Security', 'East Wing', 'On Duty', 'Day', 1, 'sira,crowd,firstaid,fire,health'],
  ['James Wilson', 'M', 'SecureTech', 'West Gate', 'On Duty', 'Night', 0, 'health,tactics,cctv,sira,firstaid'],
  ['Mohammed Said', 'M', 'Falcon Security', 'Logistics Yard', 'Training', null, 3, 'sira,cctv,tactics,firstaid'],
];

function makeCerts(id: string, keys: string[], r: () => number): GCert[] {
  return keys.filter((k) => CERT_TYPES.some((c) => c.key === k)).map((key, i) => {
    const t = certType(key);
    const y = 2026 + (r() < 0.55 ? 1 : 0) + (t.validity > 24 && r() < 0.5 ? 1 : 0);
    const m = 1 + Math.floor(r() * 12);
    const d = 1 + Math.floor(r() * 28);
    const ey = y === 2026 && m < 12 ? 2027 : y;
    return { key, no: `${key.toUpperCase().slice(0, 3)}-${String(Math.abs(hash(id + key)) % 900000 + 100000)}`, issued: iso(ey - Math.round(t.validity / 12), m, d), expiry: iso(ey, m, d), status: 'Valid' as CStatus };
  });
}

function buildGuards(): Guard[] {
  const r = rng(248);
  const out: Guard[] = [];
  // Remaining 238 guards: status + company bags so totals match the KPIs (86 on duty, 142 off, 12 leave, 8 training).
  const stBag: GStatus[] = [...Array(80).fill('On Duty'), ...Array(140).fill('Off Duty'), ...Array(11).fill('On Leave'), ...Array(7).fill('Training')];
  const coBag: string[] = [...Array(91).fill('SecureTech'), ...Array(65).fill('Falcon Security'), ...Array(50).fill('Alpha Security'), ...Array(20).fill('Guardian Shield'), ...Array(12).fill('Eagle Eye Services')];
  const shuffle = <T,>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  shuffle(stBag);
  shuffle(coBag);
  const used = new Set(IMAGE_SEED.map((s) => s[0]));
  const shiftKeys: ShiftKey[] = ['Day', 'Day', 'Evening', 'Night', 'Night', 'Rotational'];
  const others = ['sira', 'firstaid', 'fire', 'health', 'cctv', 'crowd', 'tactics'];
  for (let i = 0; i < 248; i++) {
    const id = `GRD-${String(i + 1).padStart(3, '0')}`;
    let seed: Seed;
    if (i < IMAGE_SEED.length) seed = IMAGE_SEED[i];
    else {
      const gender: 'M' | 'F' = r() < 0.18 ? 'F' : 'M';
      let name = '';
      do {
        const f = gender === 'F' ? FIRST_F[Math.floor(r() * FIRST_F.length)] : FIRST_M[Math.floor(r() * FIRST_M.length)];
        name = `${f} ${LAST[Math.floor(r() * LAST.length)]}`;
      } while (used.has(name) && used.size < 600);
      used.add(name);
      const status = stBag[i - IMAGE_SEED.length];
      const loc = POSTS[Math.floor(r() * POSTS.length)].name;
      const n = 3 + Math.floor(r() * 4);
      const keys = ['sira', ...shuffle(others.slice(1)).slice(0, n - 1)];
      seed = [name, gender, coBag[i - IMAGE_SEED.length], loc, status, status === 'On Leave' || status === 'Training' ? null : shiftKeys[Math.floor(r() * shiftKeys.length)], Math.floor(r() * 4), shuffle(keys).join(',')];
    }
    const [name, gender, company, location, status, shift, tone, ck] = seed;
    const post = POSTS.find((p) => p.name === location)!;
    const site = post.site;
    const first = name.split(' ')[0].toLowerCase();
    const last = name.split(' ')[1].toLowerCase();
    const dom = company.split(' ')[0].toLowerCase() + (company === 'SecureTech' ? '' : 'sec');
    const jy = 2019 + Math.floor(r() * 7);
    const sinceMin = 20 + Math.floor(r() * 240);
    const sh = 6 * 60 + (sinceMin % 120);
    const g: Guard = {
      id, name, gender, tone, company, site, location,
      post: location === 'Head Office' ? 'Head Office - Main Gate' : location === site ? `${site} - ${['Gate 2', 'Dock Gate', 'Hall A'][i % 3]}` : `${site} - ${location}`,
      status, shift,
      mobile: `+971 5${i % 3 === 0 ? 0 : i % 3 === 1 ? 5 : 2} ${String(100 + ((i * 37) % 899))} ${String(1000 + ((i * 7919) % 8999))}`,
      email: `${first}.${last}@${dom}.ae`,
      designation: i % 11 === 0 ? 'Senior Security Guard' : i % 17 === 0 ? 'Patrol Supervisor' : 'Security Guard',
      reportingTo: SUPERVISORS[i % SUPERVISORS.length],
      dob: iso(1972 + Math.floor(r() * 30), 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28)),
      joinDate: iso(jy, 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28)),
      nationality: NATS[Math.floor(r() * NATS.length)],
      certs: makeCerts(id, ck.split(','), r),
      since: `${String(Math.floor(sh / 60)).padStart(2, '0')}:${String(sh % 60).padStart(2, '0')} AM`,
      sinceMins: 20 + (sinceMin % 200),
      lastCheckin: `${10}:${String(Math.floor(r() * 24)).padStart(2, '0')} AM`,
      rating: Math.round((3.4 + r() * 1.6) * 10) / 10,
      compliance: Math.round(78 + r() * 22),
      scans: 0,
      response: Math.round((2.2 + r() * 5) * 10) / 10,
      attendance: Math.round(86 + r() * 14),
      incidents: Math.floor(r() * 9),
    };
    g.scans = Math.round(g.compliance * 3.1 + r() * 40);
    out.push(g);
  }
  // Exact values from the image for Ahmed Hassan.
  const a = out[0];
  Object.assign(a, { mobile: '+971 50 123 4567', email: 'ahmed.hassan@securetech.ae', designation: 'Security Guard', reportingTo: 'Site Supervisor', dob: '1990-03-12', joinDate: '2024-01-01', nationality: 'UAE', since: '09:42 AM', sinceMins: 42, lastCheckin: '10:12 AM', rating: 4.8, compliance: 98, scans: 312, response: 2.4, attendance: 99, incidents: 3 });
  const exp: Record<string, [string, CStatus]> = { sira: ['2026-12-31', 'Valid'], firstaid: ['2027-06-15', 'Valid'], fire: ['2027-01-20', 'Valid'], health: ['2026-11-10', 'Expiring Soon'], cctv: ['2027-08-02', 'Valid'] };
  a.certs = a.certs.map((c) => ({ ...c, expiry: exp[c.key][0], status: exp[c.key][1] }));
  // 12 new joiners this month.
  [12, 31, 47, 66, 88, 104, 129, 150, 171, 199, 220, 241].forEach((i, k) => (out[i].joinDate = iso(2026, 10, 1 + k * 2)));
  // 17 more expiring-soon certificates (18 in total) and 4 expired.
  const exps = [3, 9, 15, 22, 28, 37, 44, 58, 71, 83, 97, 116, 133, 158, 177, 205, 230];
  exps.forEach((i, k) => {
    const c = out[i].certs[(k % (out[i].certs.length - 1)) + 1];
    c.status = 'Expiring Soon';
    c.expiry = iso(2026, 10 + (k % 2), 16 + (k % 12));
  });
  [52, 119, 186, 214].forEach((i) => {
    const c = out[i].certs[1];
    c.status = 'Expired';
    c.expiry = iso(2026, 9, 3 + (i % 20));
  });
  return out;
}
export const GUARDS_SEED: Guard[] = buildGuards();

/* ---------- Patrol routes & checkpoints ---------- */
export interface Checkpoint {
  id: string;
  name: string;
  post: string;
  x: number;
  y: number;
  tag: 'NFC' | 'QR' | 'Beacon';
  battery: number;
}
const cp = (id: string, name: string, post: string, x: number, y: number, tag: Checkpoint['tag'], battery = 90): Checkpoint => ({ id, name, post, x, y, tag, battery });
export const CHECKPOINTS: Checkpoint[] = [
  cp('CP-01', 'West Gate Barrier', 'West Gate', 90, 110, 'NFC', 92),
  cp('CP-02', 'Main Gate Guard Booth', 'Main Gate', 90, 280, 'NFC', 88),
  cp('CP-03', 'Main Entrance Turnstile', 'Main Entrance', 90, 450, 'QR'),
  cp('CP-04', 'HO Lobby', 'Head Office', 200, 110, 'Beacon', 64),
  cp('CP-05', 'HO Fire Exit North', 'Head Office', 320, 70, 'NFC', 81),
  cp('CP-06', 'East Wing Corridor', 'East Wing', 460, 120, 'NFC', 77),
  cp('CP-07', 'Data Center Mantrap', 'Data Center', 610, 110, 'Beacon', 95),
  cp('CP-08', 'UPS Room', 'Data Center', 690, 160, 'NFC', 18),
  cp('CP-09', 'Server Hall Door B', 'Server Hall', 790, 110, 'Beacon', 72),
  cp('CP-10', 'Reception Desk', 'Reception', 205, 280, 'QR'),
  cp('CP-11', 'Parking Level P1', 'Parking Area', 330, 260, 'QR'),
  cp('CP-12', 'Parking EV Chargers', 'Parking Area', 480, 320, 'NFC', 59),
  cp('CP-13', 'Production Line 1', 'Production Area', 620, 260, 'NFC', 85),
  cp('CP-14', 'Chemical Store', 'Production Area', 800, 320, 'Beacon', 12),
  cp('CP-15', 'Control Room', 'Control Room', 910, 200, 'NFC', 99),
  cp('CP-16', 'Warehouse Aisle 4', 'Warehouse', 220, 430, 'QR'),
  cp('CP-17', 'Warehouse Dock 2', 'Warehouse', 330, 500, 'NFC', 66),
  cp('CP-18', 'Cold Store Door', 'Cold Store', 460, 450, 'NFC', 73),
  cp('CP-19', 'Loading Bay Ramp', 'Loading Bay', 625, 460, 'QR'),
  cp('CP-20', 'Logistics Yard North', 'Logistics Yard', 770, 410, 'Beacon', 54),
  cp('CP-21', 'Fuel Station', 'Logistics Yard', 780, 500, 'NFC', 90),
  cp('CP-22', 'Fleet Gate Barrier', 'Fleet Gate', 910, 460, 'NFC', 83),
  cp('CP-23', 'Perimeter Fence East', 'Fleet Gate', 935, 520, 'Beacon', 41),
  cp('CP-24', 'Roof Access', 'Head Office', 260, 160, 'NFC', 87),
];
export const cpById = (id: string) => CHECKPOINTS.find((c) => c.id === id)!;

export interface PatrolRoute {
  id: string;
  name: string;
  site: string;
  checkpoints: string[];
  frequency: string;
  duration: number;
  shift: ShiftKey | 'All';
  color: string;
  active: boolean;
  compliance: number;
}
export const ROUTES_SEED: PatrolRoute[] = [
  { id: 'RT-01', name: 'Perimeter Patrol', site: 'Head Office', checkpoints: ['CP-01', 'CP-02', 'CP-03', 'CP-16', 'CP-17', 'CP-21', 'CP-23', 'CP-22'], frequency: 'Every 2 hours', duration: 45, shift: 'All', color: 'var(--ka-7c3aed)', active: true, compliance: 96 },
  { id: 'RT-02', name: 'Head Office Internal', site: 'Head Office', checkpoints: ['CP-04', 'CP-24', 'CP-05', 'CP-06', 'CP-10'], frequency: 'Hourly', duration: 25, shift: 'Day', color: 'var(--ka-3b82f6)', active: true, compliance: 98 },
  { id: 'RT-03', name: 'Data Center Secure Round', site: 'Data Center', checkpoints: ['CP-07', 'CP-08', 'CP-09', 'CP-15'], frequency: 'Every 30 min', duration: 15, shift: 'All', color: 'var(--ka-ef4444)', active: true, compliance: 99 },
  { id: 'RT-04', name: 'Production & Chemicals', site: 'Manufacturing Plant', checkpoints: ['CP-13', 'CP-14', 'CP-19', 'CP-18'], frequency: 'Every 2 hours', duration: 30, shift: 'All', color: 'var(--ka-f59e0b)', active: true, compliance: 91 },
  { id: 'RT-05', name: 'Parking & Reception', site: 'Head Office', checkpoints: ['CP-10', 'CP-11', 'CP-12'], frequency: 'Hourly', duration: 20, shift: 'Evening', color: 'var(--ka-14b8a6)', active: true, compliance: 94 },
  { id: 'RT-06', name: 'Logistics Night Sweep', site: 'Logistics Hub', checkpoints: ['CP-19', 'CP-20', 'CP-21', 'CP-22', 'CP-23'], frequency: 'Every 3 hours', duration: 35, shift: 'Night', color: 'var(--ka-ea580c)', active: true, compliance: 88 },
  { id: 'RT-07', name: 'Warehouse Stock Check', site: 'Warehouse', checkpoints: ['CP-16', 'CP-17', 'CP-18'], frequency: 'Every 4 hours', duration: 20, shift: 'Night', color: 'var(--ka-0d9488)', active: false, compliance: 0 },
];

/** Live patrol run assigned to an on-duty guard. */
export interface PatrolRun {
  id: string;
  routeId: string;
  guardId: string;
  startTick: number;
  startedAt: string;
  missed: string[];
  speed: number;
}
export interface PAlert {
  id: number;
  type: 'Missed Checkpoint' | 'Panic / SOS' | 'Idle Guard' | 'Late Patrol' | 'Geofence Exit' | 'Incident Reported' | 'Low Battery';
  text: string;
  guardId?: string;
  post: string;
  time: string;
  sev: 'Critical' | 'High' | 'Medium' | 'Low';
  ack: boolean;
}

/* ---------- Incidents ---------- */
export type ISev = 'Critical' | 'High' | 'Medium' | 'Low';
export type IStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';
export interface Incident {
  id: string;
  type: string;
  sev: ISev;
  status: IStatus;
  post: string;
  site: string;
  guardId: string;
  date: string;
  time: string;
  desc: string;
  assignee: string;
  police: boolean;
  timeline: { t: string; text: string }[];
}
export const INC_TYPES = ['Unauthorized Access', 'Suspicious Activity', 'Theft', 'Tailgating', 'Fire Alarm', 'Medical Emergency', 'Vandalism', 'Equipment Fault', 'Parking Violation', 'Lost & Found'];
const DESC: Record<string, string> = {
  'Unauthorized Access': 'Person without valid badge attempted entry; escorted out and logged.',
  'Suspicious Activity': 'Unattended vehicle loitering near perimeter fence for 20+ minutes.',
  Theft: 'Missing tool kit reported by maintenance; CCTV review requested.',
  Tailgating: 'Two people entered on a single badge swipe at the turnstile.',
  'Fire Alarm': 'Smoke detector triggered; area checked — false alarm due to dust.',
  'Medical Emergency': 'Staff member felt dizzy; first aid administered, ambulance not required.',
  Vandalism: 'Graffiti found on the external wall near the loading ramp.',
  'Equipment Fault': 'Barrier arm stuck open; facilities ticket raised.',
  'Parking Violation': 'Vehicle parked in fire lane; owner contacted and moved.',
  'Lost & Found': 'Wallet handed in at the guard booth; owner identified.',
};
function buildIncidents(): Incident[] {
  const r = rng(77);
  const out: Incident[] = [];
  const sevs: ISev[] = ['Low', 'Low', 'Medium', 'Medium', 'Medium', 'High', 'Critical'];
  for (let i = 0; i < 64; i++) {
    const type = INC_TYPES[Math.floor(r() * INC_TYPES.length)];
    const day = 14 - Math.floor(i / 4.5);
    const post = POSTS[Math.floor(r() * POSTS.length)];
    const status: IStatus = i < 5 ? 'Open' : i < 11 ? 'In Progress' : i < 40 ? (r() < 0.6 ? 'Closed' : 'Resolved') : 'Closed';
    const hh = 6 + Math.floor(r() * 17);
    const mm = Math.floor(r() * 60);
    const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    out.push({
      id: `INC-2026-${String(486 - i).padStart(4, '0')}`,
      type, sev: type === 'Fire Alarm' || type === 'Theft' ? (r() < 0.5 ? 'High' : 'Critical') : sevs[Math.floor(r() * sevs.length)], status,
      post: post.name, site: post.site, guardId: `GRD-${String(1 + Math.floor(r() * 248)).padStart(3, '0')}`,
      date: day > 0 ? iso(2026, 10, day) : iso(2026, 9, 30 + day), time, desc: DESC[type], assignee: SUPERVISORS[i % 4], police: type === 'Theft' && r() < 0.5,
      timeline: [
        { t: time, text: 'Incident reported via guard app' },
        { t: `${String(hh).padStart(2, '0')}:${String(Math.min(59, mm + 4)).padStart(2, '0')}`, text: 'Acknowledged by control room' },
        ...(status !== 'Open' ? [{ t: `${String(Math.min(23, hh + 1)).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, text: 'Supervisor on scene' }] : []),
        ...(status === 'Resolved' || status === 'Closed' ? [{ t: `${String(Math.min(23, hh + 2)).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, text: status === 'Closed' ? 'Report approved and closed' : 'Resolved, awaiting report approval' }] : []),
      ],
    });
  }
  out[0] = { ...out[0], type: 'Suspicious Activity', sev: 'High', post: 'Parking Area', site: 'Head Office', guardId: 'GRD-006', time: '10:05', desc: 'Unknown person checking car door handles on Parking Level P1.' };
  out[1] = { ...out[1], type: 'Tailgating', sev: 'Medium', post: 'Main Gate', site: 'Head Office', guardId: 'GRD-002', time: '09:31', desc: DESC['Tailgating'] };
  return out;
}
export const INCIDENTS_SEED = buildIncidents();

/* ---------- Equipment ---------- */
export type AStatus = 'Issued' | 'In Stock' | 'Maintenance' | 'Lost';
export interface Asset {
  id: string;
  type: string;
  model: string;
  serial: string;
  status: AStatus;
  guardId: string | null;
  site: string;
  issued: string;
  service: string;
  battery: number | null;
}
export const ASSET_TYPES: { type: string; prefix: string; model: string; icon: string; n: number; battery: boolean }[] = [
  { type: 'Two-way Radio', prefix: 'RAD', model: 'Motorola DP4400e', icon: 'wifi', n: 120, battery: true },
  { type: 'Body-worn Camera', prefix: 'BWC', model: 'Axon Body 4', icon: 'eye', n: 64, battery: true },
  { type: 'Guard Tour Wand', prefix: 'GTW', model: 'GuardTour Pro NFC', icon: 'fingerprint', n: 48, battery: true },
  { type: 'Flashlight', prefix: 'TOR', model: 'Maglite ML300L', icon: 'lightbulb', n: 90, battery: true },
  { type: 'Metal Detector', prefix: 'MD', model: 'Garrett SuperWand', icon: 'locate', n: 22, battery: true },
  { type: 'Key Set', prefix: 'KEY', model: 'Master key ring', icon: 'key-round', n: 36, battery: false },
  { type: 'Patrol Vehicle', prefix: 'VEH', model: 'Nissan Patrol / Golf cart', icon: 'truck', n: 8, battery: false },
];
function buildAssets(guards: Guard[]): Asset[] {
  const r = rng(31);
  const out: Asset[] = [];
  const onDuty = guards.filter((g) => g.status === 'On Duty');
  for (const t of ASSET_TYPES) {
    for (let i = 0; i < t.n; i++) {
      const x = r();
      const status: AStatus = x < 0.6 ? 'Issued' : x < 0.88 ? 'In Stock' : x < 0.97 ? 'Maintenance' : 'Lost';
      const g = status === 'Issued' ? onDuty[(i * 7 + t.n) % onDuty.length] : null;
      out.push({
        id: `${t.prefix}-${String(i + 1).padStart(3, '0')}`, type: t.type, model: t.model, serial: `SN${Math.abs(hash(t.prefix + i)) % 9000000 + 1000000}`, status, guardId: g?.id ?? null,
        site: g?.site ?? SITE_NAMES[i % SITE_NAMES.length], issued: g ? iso(2026, 10, 14) : '', service: iso(2026 + (r() < 0.5 ? 1 : 0), 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28)), battery: t.battery ? Math.round(15 + r() * 85) : null,
      });
    }
  }
  // Ahmed's kit
  const kit = ['RAD-001', 'BWC-001', 'GTW-001', 'TOR-001'];
  out.forEach((a) => kit.includes(a.id) && Object.assign(a, { status: 'Issued', guardId: 'GRD-001', site: 'Head Office', issued: '2026-10-14' }));
  return out;
}

/* ---------- Permits & access ---------- */
export interface Permit {
  id: string;
  guardId: string;
  type: string;
  zones: string[];
  from: string;
  to: string;
  status: 'Active' | 'Pending' | 'Expired' | 'Rejected' | 'Revoked';
  approver: string;
  reason: string;
}
export const PERMIT_TYPES = ['Site Access Permit', 'Restricted Zone Authorization', 'Key Holder Authorization', 'Vehicle Pass', 'After-hours Access', 'CCTV Room Access'];
function buildPermits(guards: Guard[]): Permit[] {
  const r = rng(91);
  const out: Permit[] = [];
  let n = 1;
  for (const g of guards) {
    const zones = [g.location];
    out.push({ id: `PRM-${String(n++).padStart(4, '0')}`, guardId: g.id, type: 'Site Access Permit', zones: [g.site], from: g.joinDate, to: '2027-12-31', status: 'Active', approver: 'Security Manager', reason: 'Standard deployment' });
    if (r() < 0.35) {
      const z = ['Data Center', 'Server Hall', 'Control Room'][Math.floor(r() * 3)];
      out.push({ id: `PRM-${String(n++).padStart(4, '0')}`, guardId: g.id, type: r() < 0.5 ? 'Restricted Zone Authorization' : 'CCTV Room Access', zones: [z, ...zones], from: '2026-01-01', to: ((x) => (x < 0.05 ? '2026-09-30' : x < 0.22 ? '2026-11-30' : '2027-06-30'))(r()), status: 'Active', approver: 'Data Center Manager', reason: 'Post requirement' });
    }
    if (r() < 0.12) out.push({ id: `PRM-${String(n++).padStart(4, '0')}`, guardId: g.id, type: r() < 0.5 ? 'Key Holder Authorization' : 'Vehicle Pass', zones: [g.site], from: '2026-03-01', to: '2027-02-28', status: 'Active', approver: 'Facilities Manager', reason: 'Night key holder rota' });
  }
  out.forEach((p) => p.to < '2026-10-14' && (p.status = 'Expired'));
  const pend: [string, string, string, string][] = [
    ['GRD-001', 'Restricted Zone Authorization', 'Data Center', 'Cover for night shift at DC mantrap'],
    ['GRD-004', 'After-hours Access', 'Production Area', 'Weekend shutdown maintenance escort'],
    ['GRD-008', 'CCTV Room Access', 'Control Room', 'Relief CCTV operator'],
    ['GRD-013', 'Vehicle Pass', 'Logistics Hub', 'Patrol cart assignment'],
    ['GRD-027', 'Key Holder Authorization', 'Warehouse', 'Warehouse key holder rota'],
    ['GRD-041', 'Restricted Zone Authorization', 'Server Hall', 'Server migration night support'],
    ['GRD-066', 'Site Access Permit', 'Manufacturing Plant', 'New joiner deployment'],
    ['GRD-088', 'Site Access Permit', 'Data Center', 'New joiner deployment'],
  ];
  pend.forEach(([guardId, type, z, reason], i) => out.unshift({ id: `PRM-${String(n++).padStart(4, '0')}`, guardId, type, zones: [z], from: iso(2026, 10, 15 + i), to: '2027-03-31', status: 'Pending', approver: '', reason }));
  return out;
}

/* ---------- Training ---------- */
export interface Course {
  id: string;
  name: string;
  cert: string;
  date: string;
  time: string;
  venue: string;
  trainer: string;
  seats: number;
  enrolled: string[];
  mode: 'Classroom' | 'Online' | 'Practical';
}
export const COURSES_SEED: Course[] = [
  { id: 'TR-301', name: 'Health & Fitness Assessment', cert: 'health', date: '2026-10-20', time: '08:00', venue: 'HO Training Room 2', trainer: 'Dr. Sara Haddad', seats: 20, enrolled: ['GRD-001', 'GRD-004', 'GRD-010'], mode: 'Practical' },
  { id: 'TR-302', name: 'First Aid & CPR Refresher', cert: 'firstaid', date: '2026-10-22', time: '09:00', venue: 'HO Training Room 1', trainer: 'Red Crescent – Ahmed Nasser', seats: 24, enrolled: ['GRD-010', 'GRD-016', 'GRD-023', 'GRD-029', 'GRD-038'], mode: 'Classroom' },
  { id: 'TR-303', name: 'Fire Warden & Evacuation', cert: 'fire', date: '2026-10-27', time: '14:00', venue: 'Manufacturing Plant – Yard', trainer: 'Civil Defence Academy', seats: 30, enrolled: ['GRD-045', 'GRD-059', 'GRD-072'], mode: 'Practical' },
  { id: 'TR-304', name: 'SIRA License Renewal Prep', cert: 'sira', date: '2026-11-03', time: '10:00', venue: 'Online (Teams)', trainer: 'SecureTech Academy', seats: 40, enrolled: ['GRD-084', 'GRD-098'], mode: 'Online' },
  { id: 'TR-305', name: 'CCTV Operations Level 2', cert: 'cctv', date: '2026-11-09', time: '09:00', venue: 'Control Room Lab', trainer: 'Kenji Sato', seats: 12, enrolled: ['GRD-008'], mode: 'Classroom' },
  { id: 'TR-306', name: 'Crowd Management for Events', cert: 'crowd', date: '2026-11-18', time: '13:00', venue: 'HO Auditorium', trainer: 'Eagle Eye Services', seats: 35, enrolled: [], mode: 'Classroom' },
];

/* ---------- Roster ---------- */
export const WEEK_DAYS = ['Mon 12', 'Tue 13', 'Wed 14', 'Thu 15', 'Fri 16', 'Sat 17', 'Sun 18'];
export type RCode = 'D' | 'E' | 'N' | 'OFF' | 'L' | 'T';
export function baseRoster(g: Guard, week = 0): RCode[] {
  const h = Math.abs(hash(g.id + week));
  const code: RCode = g.shift === 'Night' ? 'N' : g.shift === 'Evening' ? 'E' : 'D';
  return WEEK_DAYS.map((_, d) => {
    if (g.status === 'On Leave' && d >= 1 && d <= 5) return 'L';
    if (g.status === 'Training' && d >= 2 && d <= 3) return 'T';
    if ((d + h) % 7 === 5 || (d + h) % 7 === 6) return 'OFF';
    if (g.shift === 'Rotational') return (['D', 'E', 'N'] as RCode[])[(d + h) % 3];
    return code;
  });
}
export const RCODE: Record<RCode, { label: string; bg: string; fg: string }> = {
  D: { label: 'Day 06–14', bg: 'var(--kb-fef3c7)', fg: 'var(--kf-b45309)' },
  E: { label: 'Eve 14–22', bg: 'var(--kb-ede9fe)', fg: 'var(--kf-6d28d9)' },
  N: { label: 'Night 22–06', bg: 'var(--kb-dbeafe)', fg: 'var(--kf-1d4ed8)' },
  OFF: { label: 'Off', bg: 'var(--kb-f3f4f6)', fg: 'var(--kf-6b7280)' },
  L: { label: 'Leave', bg: 'var(--kb-fee2e2)', fg: 'var(--kf-b91c1c)' },
  T: { label: 'Training', bg: 'var(--kb-cffafe)', fg: 'var(--kf-0e7490)' },
};

export interface OpenShift {
  id: string;
  post: string;
  day: number;
  code: RCode;
  reason: string;
  filledBy?: string;
}
export interface SwapReq {
  id: string;
  from: string;
  to: string;
  day: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
}

export interface PatrolSettingsModel {
  scanWindow: number;
  idleMins: number;
  geofence: boolean;
  panic: boolean;
  photoProof: boolean;
  gps: number;
  autoEscalate: number;
  certReminder: number;
  minRest: number;
  maxHours: number;
  overtimeApproval: boolean;
  smsAlerts: boolean;
  emailDigest: boolean;
  requireSelfie: boolean;
}

/** Root store: guards, patrols, incidents, assets, permits shared across all patrol pages. */
@Injectable({ providedIn: 'root' })
export class PatrolStore {
  private readonly app = inject(AppState);
  readonly guards = signal<Guard[]>(GUARDS_SEED.map((g) => ({ ...g, certs: g.certs.map((c) => ({ ...c })) })));
  readonly routes = signal<PatrolRoute[]>(ROUTES_SEED.map((r) => ({ ...r })));
  readonly checkpoints = signal<Checkpoint[]>(CHECKPOINTS.map((c) => ({ ...c })));
  readonly incidents = signal<Incident[]>(INCIDENTS_SEED.map((i) => ({ ...i })));
  readonly assets = signal<Asset[]>(buildAssets(GUARDS_SEED));
  readonly permits = signal<Permit[]>(buildPermits(GUARDS_SEED));
  readonly courses = signal<Course[]>(COURSES_SEED.map((c) => ({ ...c, enrolled: [...c.enrolled] })));
  readonly companies = signal<SecCompany[]>(SEC_COMPANIES.map((c) => ({ ...c })));
  readonly rosterEdits = signal<Record<string, RCode>>({});
  readonly openShifts = signal<OpenShift[]>([
    { id: 'OS-1', post: 'Data Center', day: 2, code: 'N', reason: 'Sick leave – David Lee' },
    { id: 'OS-2', post: 'Main Gate', day: 3, code: 'D', reason: 'Extra cover – VIP visit' },
    { id: 'OS-3', post: 'Logistics Yard', day: 4, code: 'N', reason: 'Training – Mohammed Said' },
    { id: 'OS-4', post: 'Production Area', day: 5, code: 'E', reason: 'Shutdown maintenance' },
    { id: 'OS-5', post: 'Parking Area', day: 6, code: 'D', reason: 'Event – Family Day' },
  ]);
  readonly swaps = signal<SwapReq[]>([
    { id: 'SW-1', from: 'GRD-002', to: 'GRD-019', day: 4, reason: 'Family commitment', status: 'Pending' },
    { id: 'SW-2', from: 'GRD-009', to: 'GRD-034', day: 5, reason: 'Medical appointment', status: 'Pending' },
    { id: 'SW-3', from: 'GRD-021', to: 'GRD-055', day: 6, reason: 'Course attendance', status: 'Pending' },
  ]);
  readonly settings = signal<PatrolSettingsModel>({ scanWindow: 10, idleMins: 15, geofence: true, panic: true, photoProof: false, gps: 30, autoEscalate: 5, certReminder: 30, minRest: 11, maxHours: 60, overtimeApproval: true, smsAlerts: true, emailDigest: true, requireSelfie: true });
  readonly runs = signal<PatrolRun[]>([]);
  readonly alerts = signal<PAlert[]>([
    { id: 1, type: 'Missed Checkpoint', text: 'CP-14 Chemical Store not scanned within window', guardId: 'GRD-004', post: 'Production Area', time: '10:18 AM', sev: 'High', ack: false },
    { id: 2, type: 'Incident Reported', text: 'Suspicious Activity · Parking Level P1', guardId: 'GRD-006', post: 'Parking Area', time: '10:05 AM', sev: 'High', ack: false },
    { id: 3, type: 'Idle Guard', text: 'No movement for 16 min', guardId: 'GRD-024', post: 'Cold Store', time: '09:58 AM', sev: 'Medium', ack: false },
    { id: 4, type: 'Low Battery', text: 'Checkpoint CP-14 tag battery 12%', post: 'Production Area', time: '09:40 AM', sev: 'Low', ack: false },
    { id: 5, type: 'Late Patrol', text: 'Logistics Night Sweep started 12 min late', guardId: 'GRD-040', post: 'Logistics Yard', time: '09:35 AM', sev: 'Medium', ack: true },
  ]);
  /** Live checkpoint scan stream (newest first). */
  readonly scans = signal<{ id: number; time: string; guardId: string; cp: string; ok: boolean }[]>([]);
  readonly scansToday = computed(() => 1284 + this.scans().length);
  readonly calls = signal<{ guardId: string; at: string; kind: 'Call' | 'Message'; text?: string }[]>([]);

  readonly byId = computed(() => new Map(this.guards().map((g) => [g.id, g])));
  guard(id: string | null | undefined) {
    return id ? this.byId().get(id) : undefined;
  }
  readonly onDuty = computed(() => this.guards().filter((g) => g.status === 'On Duty'));
  readonly counts = computed(() => {
    const c = { total: 0, on: 0, off: 0, leave: 0, training: 0, expiring: 0, expired: 0, newJoin: 0 };
    for (const g of this.guards()) {
      c.total++;
      if (g.status === 'On Duty') c.on++;
      else if (g.status === 'Off Duty') c.off++;
      else if (g.status === 'On Leave') c.leave++;
      else c.training++;
      if (g.joinDate.startsWith('2026-10')) c.newJoin++;
      for (const x of g.certs) x.status === 'Expiring Soon' ? c.expiring++ : x.status === 'Expired' && c.expired++;
    }
    return c;
  });
  readonly openIncidents = computed(() => this.incidents().filter((i) => i.status === 'Open' || i.status === 'In Progress'));

  constructor() {
    const on = this.onDuty();
    const pick = (id: string) => on.find((g) => g.id === id)?.id ?? on[0].id;
    this.runs.set(
      this.routes().filter((r) => r.active).flatMap((r, i) => {
        const g1 = i === 1 ? pick('GRD-001') : i === 3 ? pick('GRD-004') : i === 4 ? pick('GRD-006') : on[(i * 9 + 13) % on.length].id;
        const base: PatrolRun = { id: `PR-${i + 1}`, routeId: r.id, guardId: g1, startTick: -i * 3, startedAt: `${9 + (i % 2)}:${String(10 + i * 7).padStart(2, '0')} AM`, missed: r.id === 'RT-04' ? ['CP-14'] : [], speed: 0.9 + (i % 3) * 0.2 };
        return i < 2 ? [base, { ...base, id: `PR-${i + 10}`, guardId: on[(i * 17 + 40) % on.length].id, startTick: -12 - i * 5, speed: 0.8 }] : [base];
      }),
    );
    // Live: occasionally raise an alert or scan event.
    effect(() => {
      const t = this.app.tick();
      untracked(() => {
        if (!t) return;
        const runs = this.runs();
        const run = runs[t % runs.length];
        if (run) {
          const st = this.runState(run, t);
          const ok = !(t % 11 === 0);
          this.scans.update((l) => [{ id: t, time: this.now(), guardId: run.guardId, cp: st.next.id, ok }, ...l].slice(0, 60));
        }
        if (t % 14 !== 0) return;
        const g = this.onDuty()[(t * 7) % this.onDuty().length];
        const kinds: PAlert['type'][] = ['Idle Guard', 'Missed Checkpoint', 'Late Patrol', 'Geofence Exit'];
        const type = kinds[(t / 14) % kinds.length];
        const cpx = CHECKPOINTS[(t * 3) % CHECKPOINTS.length];
        this.raise({ type, guardId: g.id, post: g.location, sev: type === 'Geofence Exit' ? 'High' : 'Medium', text: type === 'Missed Checkpoint' ? `${cpx.id} ${cpx.name} not scanned within window` : type === 'Idle Guard' ? 'No movement for 15 min' : type === 'Late Patrol' ? 'Patrol round started late' : 'Guard left assigned post geofence' });
      });
    });
  }

  now() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  raise(a: Omit<PAlert, 'id' | 'time' | 'ack'>) {
    this.alerts.update((l) => [{ ...a, id: Date.now() + Math.random(), time: this.now(), ack: false }, ...l].slice(0, 40));
  }
  patchGuard(id: string, ch: Partial<Guard>) {
    this.guards.update((l) => l.map((g) => (g.id === id ? { ...g, ...ch } : g)));
  }
  addGuard(g: Guard) {
    this.guards.update((l) => [g, ...l]);
  }
  nextGuardId() {
    const max = Math.max(...this.guards().map((g) => +g.id.slice(4)));
    return `GRD-${String(max + 1).padStart(3, '0')}`;
  }
  renewCert(guardId: string, key: string) {
    const g = this.guard(guardId);
    if (!g) return;
    const t = certType(key);
    const y = 2026 + Math.round(t.validity / 12);
    this.patchGuard(guardId, { certs: g.certs.map((c) => (c.key === key ? { ...c, status: 'Valid', issued: '2026-10-14', expiry: `${y}-10-14` } : c)) });
  }
  addCert(guardId: string, key: string, expiry: string) {
    const g = this.guard(guardId);
    if (!g || g.certs.some((c) => c.key === key)) return this.renewCert(guardId, key);
    this.patchGuard(guardId, { certs: [...g.certs, { key, no: `${key.toUpperCase().slice(0, 3)}-${Math.abs(hash(guardId + key)) % 900000 + 100000}`, issued: '2026-10-14', expiry, status: 'Valid' }] });
  }
  reportIncident(i: Omit<Incident, 'id' | 'timeline' | 'status' | 'date' | 'time'>) {
    const n = Math.max(...this.incidents().map((x) => +x.id.slice(-4))) + 1;
    const time = new Date().toTimeString().slice(0, 5);
    const inc: Incident = { ...i, id: `INC-2026-${String(n).padStart(4, '0')}`, status: 'Open', date: '2026-10-14', time, timeline: [{ t: time, text: 'Incident reported' }] };
    this.incidents.update((l) => [inc, ...l]);
    this.raise({ type: 'Incident Reported', text: `${i.type} · ${i.post}`, guardId: i.guardId, post: i.post, sev: i.sev });
    return inc;
  }
  setIncident(id: string, status: IStatus, note: string) {
    const time = new Date().toTimeString().slice(0, 5);
    this.incidents.update((l) => l.map((x) => (x.id === id ? { ...x, status, timeline: [...x.timeline, { t: time, text: note }] } : x)));
  }
  log(guardId: string, kind: 'Call' | 'Message', text?: string) {
    this.calls.update((l) => [{ guardId, at: this.now(), kind, text }, ...l]);
  }
  roster(g: Guard, week = 0): RCode[] {
    const e = this.rosterEdits();
    return baseRoster(g, week).map((c, d) => e[`${week}:${g.id}:${d}`] ?? c);
  }
  setRoster(guardId: string, day: number, code: RCode, week = 0) {
    this.rosterEdits.update((m) => ({ ...m, [`${week}:${guardId}:${day}`]: code }));
  }
  /** Position of a patrol run along its route at the current tick (0..1 progress + map point). */
  runState(run: PatrolRun, tick: number) {
    const r = this.routes().find((x) => x.id === run.routeId)!;
    const pts = r.checkpoints.map((id) => cpById(id));
    const n = pts.length;
    const steps = Math.max(0, (tick - run.startTick) * run.speed * 0.25 + 1.3);
    const prog = (steps % (n + 1)) / n;
    const f = Math.min(prog * (n - 1), n - 1);
    const i = Math.floor(f);
    const a = pts[i];
    const b = pts[Math.min(i + 1, n - 1)];
    const k = f - i;
    const done = Math.min(n, Math.floor(prog * n + 0.0001) || 1);
    return { route: r, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, done, total: n, pct: Math.round((done / n) * 100), next: pts[Math.min(done, n - 1)] };
  }
}
