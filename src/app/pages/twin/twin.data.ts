// Digital Twin & Spatial Intelligence — one hard-coded dataset + root store shared by all twin pages.
import { computed, inject, Injectable, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';

/* Plan coordinates: every floor is 1000 × 560 units (building shell 20..980 × 20..540), 1 unit = 0.08 m. */
export const PLAN_W = 1000;
export const PLAN_H = 560;
export const M_PER_UNIT = 0.08;

export type ZoneType = 'workstations' | 'meeting' | 'cafeteria' | 'collab' | 'server' | 'storage' | 'reception' | 'core' | 'pods' | 'lobby' | 'hvac' | 'solar' | 'security' | 'wellness';
export type ZoneGroup = 'Workspaces' | 'Restricted' | 'Common Areas' | 'Service';
export type EntKind = 'employee' | 'visitor' | 'contractor' | 'asset' | 'sensor';

export interface TZone {
  id: string;
  floor: string;
  name: string;
  type: ZoneType;
  x: number;
  y: number;
  w: number;
  h: number;
  capacity: number;
  occupancy: number;
  restricted?: boolean;
  /** Bookable / managed by the workplace team. */
  owner: string;
  status: 'Active' | 'Maintenance' | 'Closed';
}
export interface TFloor {
  id: string;
  name: string;
  short: string;
  people: number;
  util: number;
  area: number;
}
export interface TEntity {
  id: string;
  kind: EntKind;
  name: string;
  sub: string;
  dept: string;
  floor: string;
  zone: string;
  x: number;
  y: number;
  status: string;
  /** Asset / sensor category. */
  type: string;
  battery?: number;
  /** Shown as a large pin on the 3D viewer. */
  pin?: boolean;
  /** Moves around (live). */
  mobile?: boolean;
  initials?: string;
  avatar?: string;
}
export interface TSensor extends TEntity {
  metric: 'Temperature' | 'Humidity' | 'CO₂' | 'Occupancy' | 'Air Quality' | 'Smoke' | 'Energy';
  unit: string;
  value: number;
  min: number;
  max: number;
}
export interface TAlert {
  id: string;
  title: string;
  detail: string;
  zone: string;
  floor: string;
  x: number;
  y: number;
  time: string;
  severity: 'Critical' | 'High' | 'Medium';
  icon: string;
  isNew: boolean;
  ack: boolean;
}
export interface TActivity {
  id: number;
  icon: string;
  color: string;
  who: string;
  what: string;
  time: string;
  /** Entity / zone the row points at on the map. */
  ref?: string;
  floor?: string;
}
export interface TScenario {
  id: string;
  name: string;
  occupancy: number;
  blockedExits: number;
  hvacSetpoint: number;
  outsideTemp: number;
  shift: string;
  evacMin: number;
  energyKwh: number;
  comfort: number;
  congestion: number;
  created: string;
  by: string;
}
export interface TReport {
  id: string;
  name: string;
  category: string;
  schedule: string;
  format: string;
  last: string;
  owner: string;
  status: 'Ready' | 'Generating' | 'Scheduled';
}

export const TYPE_COLOR: Record<EntKind, string> = { employee: '#2563eb', visitor: '#f59e0b', contractor: '#16a34a', asset: '#7c3aed', sensor: '#0ea5e9' };
export const TYPE_ICON: Record<EntKind, string> = { employee: 'user', visitor: 'user', contractor: 'hard-hat', asset: 'twin-dolly', sensor: 'twin-sensor' };
export const DEPTS = ['IT', 'Finance', 'HR', 'Operations', 'Sales', 'Marketing', 'Legal', 'Facilities'];
export const DEPT_COLOR: Record<string, string> = { IT: '#2563eb', Finance: '#0891b2', HR: '#db2777', Operations: '#ea580c', Sales: '#16a34a', Marketing: '#9333ea', Legal: '#64748b', Facilities: '#ca8a04', Visitor: '#f59e0b', Contractor: '#16a34a' };
export const ZONE_GROUP: Record<ZoneType, ZoneGroup> = {
  workstations: 'Workspaces', pods: 'Workspaces', meeting: 'Workspaces', collab: 'Common Areas', cafeteria: 'Common Areas', reception: 'Common Areas', lobby: 'Common Areas', wellness: 'Common Areas',
  server: 'Restricted', security: 'Restricted', storage: 'Service', core: 'Service', hvac: 'Service', solar: 'Service',
};
export const ZONE_COLOR: Record<ZoneGroup, string> = { Workspaces: '#3b82f6', 'Common Areas': '#22c55e', Restricted: '#ef4444', Service: '#94a3b8' };

export const BUILDINGS = [
  { id: 'A', name: 'Building A - Head Office', site: 'Head Office - Main Building', floors: 7 },
  { id: 'B', name: 'Building B - Annex', site: 'Head Office - Annex', floors: 3 },
  { id: 'W', name: 'Warehouse W1', site: 'Logistics Hub - Warehouse', floors: 2 },
];
export const SITES = ['Head Office - Main Building', 'Head Office - Annex', 'Logistics Hub - Warehouse', 'Manufacturing Plant'];

export const FLOORS: TFloor[] = [
  { id: 'R', name: 'Roof', short: 'Roof', people: 0, util: 0, area: 2400 },
  { id: '5', name: 'Floor 5', short: '5th Floor', people: 51, util: 58, area: 3200 },
  { id: '4', name: 'Floor 4', short: '4th Floor', people: 92, util: 68, area: 3200 },
  { id: '3', name: 'Floor 3', short: '3rd Floor', people: 71, util: 63, area: 3200 },
  { id: '2', name: 'Floor 2', short: '2nd Floor', people: 84, util: 71, area: 3200 },
  { id: '1', name: 'Floor 1', short: '1st Floor', people: 78, util: 66, area: 3200 },
  { id: 'G', name: 'Ground Floor', short: 'Ground Floor', people: 52, util: 61, area: 3400 },
];
export const floorById = (id: string) => FLOORS.find((f) => f.id === id) ?? FLOORS[2];

/* ---------- deterministic RNG ---------- */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ---------- zone layouts ---------- */
type Z = [string, ZoneType, number, number, number, number, number];
const OFFICE: Z[] = [
  ['Meeting Rooms', 'meeting', 20, 20, 310, 220, 30],
  ['Open Workstations North', 'workstations', 330, 20, 300, 190, 48],
  ['Cafeteria', 'cafeteria', 630, 20, 350, 190, 60],
  ['Workstations West', 'workstations', 20, 240, 200, 150, 24],
  ['Lift Core', 'core', 230, 250, 130, 120, 0],
  ['Collaboration Area', 'collab', 380, 240, 250, 160, 28],
  ['Focus Pods', 'pods', 640, 220, 110, 170, 8],
  ['Server Room', 'server', 760, 220, 220, 170, 4],
  ['Reception', 'reception', 20, 400, 290, 140, 12],
  ['Workstations South', 'workstations', 320, 410, 310, 130, 32],
  ['Storage', 'storage', 640, 400, 340, 140, 6],
];
const GROUND: Z[] = [
  ['Main Lobby', 'lobby', 20, 20, 420, 300, 80],
  ['Security Desk', 'security', 440, 20, 180, 160, 4],
  ['Staff Cafeteria', 'cafeteria', 620, 20, 360, 220, 120],
  ['Lift Core', 'core', 450, 200, 140, 120, 0],
  ['Wellness & Gym', 'wellness', 600, 250, 380, 150, 30],
  ['Reception', 'reception', 20, 330, 420, 210, 16],
  ['Loading & Storage', 'storage', 440, 400, 540, 140, 10],
];
const ROOF: Z[] = [
  ['HVAC Plant', 'hvac', 20, 20, 420, 260, 0],
  ['Lift Core', 'core', 450, 200, 140, 120, 0],
  ['Solar Array', 'solar', 600, 20, 380, 520, 0],
  ['Water & Pumps', 'storage', 20, 300, 420, 240, 0],
];
const FLOOR_NAMES: Record<string, Partial<Record<string, string>>> = {
  '5': { 'Open Workstations North': 'Executive Suite', 'Workstations West': 'Board Room Annex', 'Workstations South': 'Legal Workstations', Cafeteria: 'Executive Lounge' },
  '3': { 'Open Workstations North': 'Finance Workstations', 'Workstations South': 'HR Workstations', 'Server Room': 'Records Room' },
  '2': { 'Open Workstations North': 'Sales Floor', 'Workstations South': 'Marketing Studio', 'Server Room': 'Data Room' },
  '1': { 'Open Workstations North': 'Operations Center', 'Workstations South': 'Training Rooms', Cafeteria: 'Town Hall' },
};
const ZONE_UTIL_F4: Record<string, number> = { 'Meeting Rooms': 0.72, 'Open Workstations North': 0.71, Cafeteria: 0.8, 'Workstations West': 0.67, 'Collaboration Area': 0.55, 'Focus Pods': 0.62, 'Server Room': 0.5, Reception: 0.5, 'Workstations South': 0.66, Storage: 0.33 };

function buildZones(): TZone[] {
  const out: TZone[] = [];
  for (const f of FLOORS) {
    const tpl = f.id === 'G' ? GROUND : f.id === 'R' ? ROOF : OFFICE;
    const r = rng(f.id.charCodeAt(0) * 97);
    tpl.forEach(([name, type, x, y, w, h, cap], i) => {
      const nm = FLOOR_NAMES[f.id]?.[name] ?? name;
      const u = f.id === '4' ? ZONE_UTIL_F4[name] ?? 0.5 : 0.35 + r() * 0.5;
      out.push({
        id: `Z${f.id}-${i + 1}`, floor: f.id, name: nm, type, x, y, w, h, capacity: cap, occupancy: Math.round(cap * u),
        restricted: ZONE_GROUP[type] === 'Restricted', owner: ZONE_GROUP[type] === 'Restricted' ? 'IT Infrastructure' : ZONE_GROUP[type] === 'Service' ? 'Facilities' : 'Workplace Team',
        status: f.id === '2' && type === 'pods' ? 'Maintenance' : 'Active',
      });
    });
  }
  return out;
}
export const ZONES0 = buildZones();

/* ---------- people ---------- */
const FIRST = ['Aisha', 'Omar', 'Priya', 'Daniel', 'Fatima', 'Rahul', 'Sara', 'Michael', 'Layla', 'Arjun', 'Noura', 'James', 'Maria', 'Khalid', 'Emma', 'Yusuf', 'Hannah', 'Vikram', 'Mariam', 'Lucas', 'Zainab', 'Ethan', 'Reem', 'Anil', 'Chloe', 'Hamza', 'Grace', 'Imran', 'Olivia', 'Tariq'];
const LAST = ['Khan', 'Sharma', 'Al Mansoori', 'Fernandes', 'Hassan', 'Patel', 'Wilson', 'Nair', 'Rahman', 'Thomas', 'Al Hashimi', 'Iyer', 'Garcia', 'Ali', 'Brown', 'Menon', 'Saeed', 'Lee', 'Joseph', 'Kapoor'];
const AV = ['#7c3aed', '#2563eb', '#db2777', '#0891b2', '#ea580c', '#16a34a', '#9333ea', '#ca8a04'];
const COMPANIES = ['Al Futtaim Facilities', 'Emrill Services', 'Siemens Building Tech', 'Johnson Controls', 'Transguard'];

function pointIn(z: TZone, r: () => number): [number, number] {
  return [Math.round(z.x + 18 + r() * (z.w - 36)), Math.round(z.y + 18 + r() * (z.h - 36))];
}
function workZones(floor: string, zones: TZone[]) {
  return zones.filter((z) => z.floor === floor && z.type !== 'core' && z.type !== 'server' && z.type !== 'hvac' && z.type !== 'solar');
}

const FEATURED: Partial<TEntity>[] = [
  { id: 'P-1001', kind: 'employee', name: 'John Mathew', dept: 'IT', sub: 'IT Department', floor: '4', x: 556, y: 120, pin: true },
  { id: 'V-102', kind: 'visitor', name: 'Visitor - V102', dept: 'Visitor', sub: 'Host: Priya Sharma', floor: '4', x: 236, y: 196, pin: true },
  { id: 'C-2201', kind: 'contractor', name: 'Ravi Kumar', dept: 'Contractor', sub: 'Emrill Services · HVAC', floor: '4', x: 372, y: 398, pin: true },
  { id: 'P-1002', kind: 'employee', name: 'Priya Sharma', dept: 'HR', sub: 'HR Department', floor: '4', x: 470, y: 60, pin: true },
  { id: 'P-1003', kind: 'employee', name: 'Ahmed Al Mansoori', dept: 'Operations', sub: 'Operations', floor: '4', x: 690, y: 262, pin: true },
  { id: 'P-1004', kind: 'employee', name: 'Sara Wilson', dept: 'Finance', sub: 'Finance Department', floor: '4', x: 395, y: 476, pin: true },
  { id: 'V-098', kind: 'visitor', name: 'Visitor - V098', dept: 'Visitor', sub: 'Host: Omar Khan', floor: '4', x: 708, y: 120, pin: true },
];

function buildPeople(zones: TZone[]): TEntity[] {
  const r = rng(4242);
  const kinds: EntKind[] = [...Array(328).fill('employee'), ...Array(24).fill('visitor'), ...Array(76).fill('contractor')];
  // remove featured kinds from the pool so totals stay 328 / 24 / 76
  for (const f of FEATURED) kinds.splice(kinds.indexOf(f.kind!), 1);
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const out: TEntity[] = [];
  let k = 0;
  for (const f of FLOORS) {
    const feat = FEATURED.filter((p) => p.floor === f.id);
    const wz = workZones(f.id, zones);
    for (const p of feat) {
      const zone = wz.find((z) => p.x! >= z.x && p.x! <= z.x + z.w && p.y! >= z.y && p.y! <= z.y + z.h)?.name ?? wz[0].name;
      const ini = p.name!.startsWith('Visitor') ? 'V' : p.name!.split(' ').map((s) => s[0]).slice(0, 2).join('');
      out.push({ status: 'On Site', type: p.kind!, zone, initials: ini, avatar: TYPE_COLOR[p.kind!], mobile: p.id === 'P-1001', ...p } as TEntity);
    }
    for (let n = feat.length; n < f.people; n++) {
      const kind = kinds[k++];
      const z = wz[Math.floor(r() * wz.length)];
      const [x, y] = pointIn(z, r);
      const first = FIRST[Math.floor(r() * FIRST.length)];
      const last = LAST[Math.floor(r() * LAST.length)];
      const dept = kind === 'employee' ? DEPTS[Math.floor(r() * DEPTS.length)] : kind === 'visitor' ? 'Visitor' : 'Contractor';
      const id = kind === 'employee' ? `P-${1100 + k}` : kind === 'visitor' ? `V-${110 + k}` : `C-${2300 + k}`;
      out.push({
        id, kind, name: kind === 'visitor' ? `${first} ${last}` : `${first} ${last}`, dept, floor: f.id, zone: z.name, x, y, type: kind,
        sub: kind === 'employee' ? `${dept} Department` : kind === 'visitor' ? `Host: ${FIRST[(k * 7) % FIRST.length]} ${LAST[(k * 3) % LAST.length]}` : COMPANIES[k % COMPANIES.length],
        status: r() < 0.12 ? 'Moving' : 'On Site', initials: first[0] + last[0], avatar: AV[k % AV.length], mobile: r() < 0.18,
        pin: kind !== 'employee' && r() < 0.12,
      });
    }
  }
  return out;
}

/* ---------- assets (1,256) ---------- */
export const ASSET_TYPES: { type: string; count: number; icon: string; color: string; mobile?: boolean }[] = [
  { type: 'Laptop', count: 412, icon: 'twin-laptop', color: '#7c3aed' },
  { type: 'Monitor', count: 380, icon: 'twin-monitor', color: '#6366f1' },
  { type: 'Smart Desk', count: 180, icon: 'twin-desk', color: '#0891b2' },
  { type: 'AV Equipment', count: 64, icon: 'twin-projector', color: '#db2777' },
  { type: 'Safety Kit / AED', count: 60, icon: 'twin-firstaid', color: '#ef4444' },
  { type: 'Printer', count: 46, icon: 'twin-printer', color: '#64748b' },
  { type: 'Server Rack', count: 42, icon: 'twin-server', color: '#0f172a' },
  { type: 'HVAC Unit', count: 38, icon: 'twin-fan', color: '#0ea5e9' },
  { type: 'Cart / Trolley', count: 28, icon: 'twin-dolly', color: '#f59e0b', mobile: true },
  { type: 'Forklift', count: 6, icon: 'twin-forklift', color: '#f97316', mobile: true },
];
const ASSET_STATUS = ['In Use', 'In Use', 'In Use', 'Available', 'Available', 'Maintenance', 'Idle'];

function buildAssets(zones: TZone[]): TEntity[] {
  const r = rng(777);
  const out: TEntity[] = [];
  const floorsFor = (t: string) =>
    t === 'Forklift' ? ['G', '4', '4', 'G', '1', 'G'] : t === 'HVAC Unit' ? ['R'] : t === 'Server Rack' ? ['4', '2', '3'] : ['G', '1', '2', '3', '4', '5'];
  let n = 0;
  for (const at of ASSET_TYPES) {
    const fl = floorsFor(at.type);
    for (let i = 0; i < at.count; i++) {
      const floor = fl[i % fl.length];
      const fz = zones.filter((z) => z.floor === floor && z.type !== 'core');
      const pref = at.type === 'Server Rack' ? fz.filter((z) => z.type === 'server') : at.type === 'Forklift' || at.type === 'Cart / Trolley' ? fz.filter((z) => z.type === 'storage') : at.type === 'Smart Desk' || at.type === 'Laptop' || at.type === 'Monitor' ? fz.filter((z) => z.type === 'workstations' || z.type === 'pods') : fz;
      const z = (pref.length ? pref : fz)[Math.floor(r() * (pref.length || fz.length))];
      const [x, y] = pointIn(z, r);
      n++;
      const code = at.type === 'Forklift' ? `Forklift-${String(i + 1).padStart(2, '0')}` : `${at.type.split(' ')[0].slice(0, 3).toUpperCase()}-${String(1000 + n)}`;
      out.push({
        id: `A-${String(n).padStart(4, '0')}`, kind: 'asset', name: code, sub: at.type, dept: DEPTS[n % DEPTS.length], floor, zone: z.name, x, y, type: at.type,
        status: at.type === 'Forklift' && i === 0 ? 'Moving' : at.type === 'Forklift' && i === 2 ? 'Low Battery' : ASSET_STATUS[Math.floor(r() * ASSET_STATUS.length)],
        battery: at.mobile || at.type === 'Laptop' ? Math.round(20 + r() * 80) : undefined,
        mobile: !!at.mobile, pin: !!at.mobile,
      });
    }
  }
  const f1 = out.find((a) => a.name === 'Forklift-01')!;
  Object.assign(f1, { floor: '4', x: 805, y: 470, zone: 'Storage', battery: 78, status: 'Moving' });
  const f3 = out.find((a) => a.name === 'Forklift-03')!;
  Object.assign(f3, { battery: 14 });
  return out;
}

/* ---------- sensors (64) ---------- */
const METRICS: [TSensor['metric'], string, number, number, number][] = [
  ['Temperature', '°C', 22.4, 18, 28],
  ['Humidity', '%', 46, 30, 60],
  ['CO₂', 'ppm', 640, 400, 1000],
  ['Occupancy', 'ppl', 18, 0, 40],
  ['Air Quality', 'AQI', 32, 0, 100],
  ['Smoke', 'obs%', 0.1, 0, 2],
  ['Energy', 'kW', 14, 0, 40],
];
function buildSensors(zones: TZone[]): TSensor[] {
  const r = rng(99);
  const out: TSensor[] = [];
  const fl = ['G', '1', '2', '3', '4', '5', 'R'];
  for (let i = 0; i < 64; i++) {
    const floor = fl[i % fl.length];
    const fz = zones.filter((z) => z.floor === floor && z.type !== 'core');
    const z = fz[(i * 5 + 3) % fz.length];
    const [metric, unit, base, min, max] = METRICS[Math.floor(i / 7) % METRICS.length];
    const [x, y] = pointIn(z, r);
    const value = +(base * (0.85 + r() * 0.3)).toFixed(metric === 'Temperature' || metric === 'Smoke' ? 1 : 0);
    out.push({ id: `S-${String(i + 1).padStart(3, '0')}`, kind: 'sensor', name: `${metric === 'CO₂' ? 'CO2' : metric.split(' ')[0]}-${floor}${String(i + 1).padStart(2, '0')}`, sub: `${metric} sensor`, dept: 'Facilities', floor, zone: z.name, x, y, type: metric, status: 'Online', metric, unit, value, min, max, battery: Math.round(55 + r() * 45), pin: true });
  }
  // the server-room sensor that raises the high temperature alert
  const t = out.find((s) => s.floor === '4' && s.metric === 'Temperature')!;
  Object.assign(t, { name: 'TEMP-SR4', zone: 'Server Room', x: 812, y: 268, value: 32, status: 'Alarm' });
  out[9].status = 'Offline';
  out[37].status = 'Offline';
  return out;
}

export const ALERTS0: TAlert[] = [
  { id: 'AL-501', title: 'High Temperature', detail: '32°C (Threshold 28°C)', zone: 'Server Room', floor: '4', x: 812, y: 268, time: '10:12 AM', severity: 'Critical', icon: 'twin-thermo', isNew: true, ack: false },
  { id: 'AL-502', title: 'Restricted Zone Entry', detail: 'Unbadged entry detected', zone: 'Data Room', floor: '2', x: 860, y: 300, time: '10:06 AM', severity: 'High', icon: 'shield', isNew: true, ack: false },
  { id: 'AL-503', title: 'Low Battery', detail: 'Forklift-03 at 14%', zone: 'Loading & Storage', floor: 'G', x: 700, y: 470, time: '09:58 AM', severity: 'Medium', icon: 'battery', isNew: true, ack: false },
  { id: 'AL-504', title: 'Over Capacity', detail: 'Town Hall 118% of capacity', zone: 'Town Hall', floor: '1', x: 800, y: 110, time: '09:41 AM', severity: 'Medium', icon: 'users', isNew: false, ack: false },
  { id: 'AL-505', title: 'Door Held Open', detail: 'Fire exit FE-5B open 4 min', zone: 'Legal Workstations', floor: '5', x: 600, y: 520, time: '09:30 AM', severity: 'High', icon: 'door-open', isNew: false, ack: false },
];

export const ACTIVITY0: TActivity[] = [
  { id: 1, icon: 'user', color: '#7c3aed', who: 'John Mathew', what: 'Arrived at 4th Floor', time: '10:22 AM', ref: 'P-1001', floor: '4' },
  { id: 2, icon: 'user', color: '#f59e0b', who: 'Visitor - V102', what: 'Entered Meeting Room 1', time: '10:18 AM', ref: 'V-102', floor: '4' },
  { id: 3, icon: 'twin-forklift', color: '#7c3aed', who: 'Forklift-01', what: 'Moved to Storage Area', time: '10:15 AM', ref: 'Forklift-01', floor: '4' },
  { id: 4, icon: 'twin-thermo', color: '#ef4444', who: 'High Temperature', what: '32°C at Server Room', time: '10:12 AM', ref: 'AL-501', floor: '4' },
  { id: 5, icon: 'twin-door', color: '#3b82f6', who: 'Conference Room 2', what: 'Booked by Priya Sharma', time: '10:10 AM', ref: 'Z4-1', floor: '4' },
  { id: 6, icon: 'shield', color: '#ef4444', who: 'Data Room', what: 'Unbadged entry on Floor 2', time: '10:06 AM', ref: 'AL-502', floor: '2' },
  { id: 7, icon: 'hard-hat', color: '#16a34a', who: 'Ravi Kumar', what: 'Checked in at Reception', time: '10:02 AM', ref: 'C-2201', floor: '4' },
  { id: 8, icon: 'battery', color: '#f59e0b', who: 'Forklift-03', what: 'Battery dropped to 14%', time: '09:58 AM', ref: 'AL-503', floor: 'G' },
];

const LIVE_EVENTS: Omit<TActivity, 'id' | 'time'>[] = [
  { icon: 'user', color: '#7c3aed', who: 'Sara Wilson', what: 'Entered Workstations South', ref: 'P-1004', floor: '4' },
  { icon: 'twin-door', color: '#3b82f6', who: 'Meeting Room 3', what: 'Checked in · 6 attendees', ref: 'Z4-1', floor: '4' },
  { icon: 'user', color: '#f59e0b', who: 'Visitor - V098', what: 'Moved to Cafeteria', ref: 'V-098', floor: '4' },
  { icon: 'twin-sensor', color: '#0ea5e9', who: 'CO2-401', what: 'CO₂ back to normal (612 ppm)', floor: '4' },
  { icon: 'user', color: '#7c3aed', who: 'Ahmed Al Mansoori', what: 'Entered Focus Pods', ref: 'P-1003', floor: '4' },
];

export const SCENARIOS0: TScenario[] = [
  { id: 'SC-01', name: 'Baseline – Typical Tuesday', occupancy: 68, blockedExits: 0, hvacSetpoint: 23, outsideTemp: 38, shift: 'Standard', evacMin: 6.1, energyKwh: 4820, comfort: 97, congestion: 2, created: '02 Oct 2026', by: 'Rex Kumar' },
  { id: 'SC-02', name: 'Town Hall – Full Occupancy', occupancy: 100, blockedExits: 0, hvacSetpoint: 23, outsideTemp: 40, shift: 'Standard', evacMin: 8.3, energyKwh: 5960, comfort: 87, congestion: 5, created: '08 Oct 2026', by: 'Priya Sharma' },
  { id: 'SC-03', name: 'Stair B Closed (Maintenance)', occupancy: 70, blockedExits: 1, hvacSetpoint: 23, outsideTemp: 37, shift: 'Standard', evacMin: 7.8, energyKwh: 4790, comfort: 97, congestion: 6, created: '11 Oct 2026', by: 'Ahmed Al Mansoori' },
];
export const REPORTS0: TReport[] = [
  { id: 'R-01', name: 'Weekly Space Utilization', category: 'Space', schedule: 'Weekly · Mon 08:00', format: 'PDF', last: '13 Oct 2026', owner: 'Workplace Team', status: 'Ready' },
  { id: 'R-02', name: 'Occupancy by Floor & Zone', category: 'Occupancy', schedule: 'Daily · 18:00', format: 'Excel', last: '13 Oct 2026', owner: 'Facilities', status: 'Ready' },
  { id: 'R-03', name: 'Asset Location Audit', category: 'Assets', schedule: 'Monthly · 1st', format: 'Excel', last: '01 Oct 2026', owner: 'IT Asset Mgmt', status: 'Ready' },
  { id: 'R-04', name: 'Environmental Compliance (IoT)', category: 'Sensors', schedule: 'Weekly · Fri 17:00', format: 'PDF', last: '10 Oct 2026', owner: 'EHS', status: 'Scheduled' },
  { id: 'R-05', name: 'Movement & Dwell Time Analysis', category: 'Movement', schedule: 'On demand', format: 'PDF', last: '09 Oct 2026', owner: 'Rex Kumar', status: 'Ready' },
  { id: 'R-06', name: 'Energy vs Occupancy Correlation', category: 'Energy', schedule: 'Monthly · 5th', format: 'PDF', last: '05 Oct 2026', owner: 'Sustainability', status: 'Ready' },
];

const PEOPLE0 = buildPeople(ZONES0);
const ASSETS0 = buildAssets(ZONES0);
const SENSORS0 = buildSensors(ZONES0);

/** Path John Mathew walked from reception (used by viewer + path analysis). */
export const JOHN_PATH: [number, number][] = [[176, 470], [230, 400], [300, 395], [330, 330], [372, 300], [440, 236], [500, 215], [556, 150]];

/** 24-hour occupancy profile (share of peak). */
export const HOURLY = [2, 2, 1, 1, 2, 4, 10, 28, 62, 84, 92, 95, 88, 90, 93, 89, 80, 58, 30, 14, 8, 5, 3, 2];
export const fmtN = (n: number) => n.toLocaleString('en-US');

@Injectable({ providedIn: 'root' })
export class TwinStore {
  private readonly app = inject(AppState);
  readonly tick = this.app.tick;
  readonly building = signal(BUILDINGS[0]);
  readonly site = signal(SITES[0]);
  readonly floor = signal('4');
  readonly zones = signal<TZone[]>(ZONES0.map((z) => ({ ...z })));
  readonly people = signal<TEntity[]>(PEOPLE0);
  readonly assets = signal<TEntity[]>(ASSETS0);
  readonly sensors = signal<TSensor[]>(SENSORS0);
  readonly alerts = signal<TAlert[]>(ALERTS0.map((a) => ({ ...a })));
  readonly activity = signal<TActivity[]>(ACTIVITY0);
  readonly scenarios = signal<TScenario[]>(SCENARIOS0);
  readonly reports = signal<TReport[]>(REPORTS0);
  /** Entity id other pages ask the viewer / location page to focus. */
  readonly focusId = signal<string | null>(null);

  readonly activeAlerts = computed(() => this.alerts().filter((a) => !a.ack));
  readonly newAlerts = computed(() => this.activeAlerts().filter((a) => a.isNew).length);
  readonly counts = computed(() => {
    const p = this.people();
    return {
      employees: p.filter((x) => x.kind === 'employee').length,
      visitors: p.filter((x) => x.kind === 'visitor').length,
      contractors: p.filter((x) => x.kind === 'contractor').length,
      people: p.length,
      assets: this.assets().length,
      sensors: this.sensors().length,
    };
  });

  /** Live position: mobile entities drift along a small loop that depends on tick. */
  pos(e: TEntity): [number, number] {
    if (!e.mobile) return [e.x, e.y];
    const t = this.tick();
    if (e.name === 'Forklift-01') {
      const k = (t % 12) / 12;
      return [e.x + Math.round(Math.sin(k * Math.PI * 2) * 60), e.y + Math.round(Math.cos(k * Math.PI * 2) * 22)];
    }
    if (e.id === 'P-1001') return [e.x, e.y];
    const h = e.id.charCodeAt(e.id.length - 1) + e.id.charCodeAt(e.id.length - 2);
    return [e.x + Math.round(Math.sin(t / 2 + h) * 14), e.y + Math.round(Math.cos(t / 3 + h) * 9)];
  }
  sensorValue(s: TSensor) {
    if (s.status === 'Offline') return s.value;
    const t = this.tick();
    const h = s.id.charCodeAt(3) + s.id.charCodeAt(4);
    const amp = s.metric === 'Temperature' ? 0.3 : s.metric === 'CO₂' ? 18 : s.metric === 'Occupancy' ? 2 : s.metric === 'Smoke' ? 0 : s.metric === 'Energy' ? 1.2 : 1.5;
    const v = s.value + Math.sin(t / 2 + h) * amp;
    return s.metric === 'Temperature' || s.metric === 'Energy' ? +v.toFixed(1) : Math.round(v);
  }
  floorZones(f: string) {
    return this.zones().filter((z) => z.floor === f);
  }
  find(id: string): TEntity | undefined {
    return this.people().find((p) => p.id === id) ?? this.assets().find((a) => a.id === id || a.name === id) ?? this.sensors().find((s) => s.id === id);
  }

  acknowledge(id: string) {
    this.alerts.update((l) => l.map((a) => (a.id === id ? { ...a, ack: true, isNew: false } : a)));
    const a = this.alerts().find((x) => x.id === id);
    if (a) this.log({ icon: 'shield-check', color: '#16a34a', who: a.title, what: `Acknowledged · ${a.zone}`, floor: a.floor });
  }
  log(e: Omit<TActivity, 'id' | 'time'>) {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    this.activity.update((l) => [{ ...e, id: Date.now() + Math.random(), time }, ...l].slice(0, 40));
  }
  /** Adds one scripted live event every few ticks (called by the viewer). */
  liveEvent(t: number) {
    if (t && t % 8 === 0) this.log(LIVE_EVENTS[(t / 8) % LIVE_EVENTS.length]);
  }
  upsertZone(z: TZone) {
    this.zones.update((l) => (l.some((x) => x.id === z.id) ? l.map((x) => (x.id === z.id ? z : x)) : [...l, z]));
  }
  removeZone(id: string) {
    this.zones.update((l) => l.filter((z) => z.id !== id));
  }
  patchAsset(id: string, ch: Partial<TEntity>) {
    this.assets.update((l) => l.map((a) => (a.id === id ? { ...a, ...ch } : a)));
  }
  patchSensor(id: string, ch: Partial<TSensor>) {
    this.sensors.update((l) => l.map((s) => (s.id === id ? { ...s, ...ch } : s)));
  }
  raiseAlert(a: Omit<TAlert, 'id' | 'time' | 'ack' | 'isNew'>) {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    this.alerts.update((l) => [{ ...a, id: `AL-${510 + l.length}`, time, ack: false, isNew: true }, ...l]);
    this.log({ icon: a.icon, color: '#ef4444', who: a.title, what: `${a.detail} · ${a.zone}`, floor: a.floor });
  }
}
