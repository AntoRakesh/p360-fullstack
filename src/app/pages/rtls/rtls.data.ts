// Hard-coded RTLS data: floors, zones, on-site people with tags, devices and alerts.
import { Injectable, computed, signal } from '@angular/core';
import { rng } from '../dashboards/demo-data';
import { MapZone } from './floor-plan';

export const FLOORS = ['Roof', 'Floor 5', 'Floor 4', 'Floor 3', 'Floor 2', 'Floor 1', 'Ground Floor', 'Basement'];

export interface RZone extends MapZone {
  floor: string;
  capacity: number;
  alertOnEntry: boolean;
  maxDwell: number;
  allowed: string;
}

/* Slot layout shared by all floors (Floor 1 matches the reference image). */
const SLOTS: [number, number, number, number, string, RZone['kind'], number?][] = [
  [40, 40, 200, 160, 'var(--ka-3b82f6)', 'safe'],
  [440, 40, 180, 110, 'var(--ka-60a5fa)', 'safe'],
  [720, 40, 250, 220, 'var(--ka-f59e0b)', 'safe'],
  [260, 170, 440, 200, 'var(--ka-94a3b8)', 'open', 0.05],
  [40, 230, 210, 290, 'var(--ka-22c55e)', 'safe'],
  [400, 390, 220, 130, 'var(--ka-8b5cf6)', 'safe'],
  [740, 290, 220, 230, 'var(--ka-ef4444)', 'restricted'],
  [260, 390, 130, 130, 'var(--ka-64748b)', 'transit', 0.06],
];
const NAMES_BY_FLOOR: Record<string, string[]> = {
  Roof: ['Plant Deck', 'Water Tanks', 'Helipad', 'Roof Garden', 'Chiller Plant', 'Solar Array', 'BMU Store', 'Stair Core'],
  'Floor 5': ['Innovation Lab', 'PMO', 'Terrace Café', 'Open Office 5', 'Hot Desks', 'Phone Booths', 'Lab Store', 'Staircase'],
  'Floor 4': ['Exec Suite', 'CEO Office', 'Exec Dining', 'Open Office 4', 'Quiet Zone', 'Wellness Room', 'Archive', 'Lift Lobby'],
  'Floor 3': ['Board Room', 'Legal', 'Breakout Area', 'Open Office 3', 'Design Studio', 'Library', 'Comms Room', 'Lift Lobby'],
  'Floor 2': ['Training Room', 'Finance Office', 'Pantry', 'Open Office 2', 'Records Room', 'Lounge', 'Electrical Room', 'Staircase'],
  'Floor 1': ['Meeting Room A', 'HR Office', 'Cafeteria', 'Open Office', 'Production Area', 'Reception', 'Server Room', 'Corridor'],
  'Ground Floor': ['Lobby', 'Security Desk', 'Loading Bay', 'Main Hall', 'Mail Room', 'Visitor Lounge', 'Control Room', 'Entrance'],
  Basement: ['Parking P1', 'Storage', 'Workshop', 'Parking P2', 'Generator Room', 'Gym', 'Plant Room', 'Ramp'],
};
const CAP = [12, 20, 60, 150, 120, 20, 10, 30];

export const ZONES: RZone[] = FLOORS.flatMap((f, fi) =>
  NAMES_BY_FLOOR[f].map((name, i) => {
    const [x, y, w, h, color, kind, fill] = SLOTS[i];
    return { id: `Z${fi}-${i}`, floor: f, name, x, y, w, h, color, kind, fill, capacity: CAP[i], alertOnEntry: kind === 'restricted', maxDwell: kind === 'restricted' ? 30 : kind === 'transit' ? 15 : 0, allowed: kind === 'restricted' ? 'IT, Facilities' : 'Everyone' };
  }),
);

/* ---------- People ---------- */
export interface RPerson {
  id: string;
  name: string;
  initials: string;
  color: string;
  dept: string;
  role: string;
  type: 'Employee' | 'Contractor' | 'Visitor';
  floor: string;
  zoneId: string;
  zone: string;
  x: number;
  y: number;
  tag: string;
  battery: number;
  since: number;
  phone: string;
  featured: boolean;
  walker?: [number, number][];
  status: string;
}
const FIRST = ['Rahul', 'Sara', 'Omar', 'Grace', 'Daniel', 'Nadia', 'Vikram', 'Aisha', 'Kenji', 'Layla', 'Tom', 'Hannah', 'Yusuf', 'Meera', 'Lucas', 'Zara', 'Noah', 'Sofia', 'Ibrahim', 'Chloe', 'Ravi', 'Emma', 'Ali', 'Mei'];
const LAST = ['Verma', 'Khan', 'Khalid', 'Park', 'Kim', 'Hussein', 'Rao', 'Bello', 'Sato', 'Haddad', 'Baker', 'Lee', 'Rahman', 'Iyer', 'Silva', 'Ahmed', 'Brown', 'Rossi', 'Musa', 'Martin'];
const DEPTS = ['IT', 'HR', 'Operations', 'Finance', 'Facilities', 'Production', 'Sales', 'Security'];
const PAL = ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0d9488)', 'var(--ka-ca8a04)', 'var(--ka-db2777)', 'var(--ka-16a34a)', 'var(--ka-ea580c)', 'var(--ka-475569)'];
const ini = (n: string) => n.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

/** Zone headcounts: Floor 1 per the reference image, the rest of the 386 spread over other floors. */
const COUNTS: Record<string, number> = {
  'Floor 1/Open Office': 128, 'Floor 1/Meeting Room A': 8, 'Floor 1/Cafeteria': 42, 'Floor 1/Production Area': 96, 'Floor 1/Server Room': 6, 'Floor 1/Reception': 14, 'Floor 1/HR Office': 5, 'Floor 1/Corridor': 4,
  'Floor 2/Open Office 2': 9, 'Floor 2/Finance Office': 6, 'Floor 2/Electrical Room': 3, 'Floor 2/Staircase': 2, 'Floor 2/Training Room': 9,
  'Floor 3/Open Office 3': 12, 'Floor 3/Board Room': 6, 'Floor 4/Exec Suite': 4, 'Floor 4/Open Office 4': 7, 'Floor 5/Innovation Lab': 5,
  'Ground Floor/Lobby': 6, 'Ground Floor/Loading Bay': 5, 'Ground Floor/Security Desk': 3, 'Basement/Workshop': 3, 'Basement/Plant Room': 3, 'Roof/Plant Deck': 0,
};
type Feat = [string, string, string, string, string, number, number, string?];
const FEATURED: Feat[] = [
  ['Arjun Mehta', 'EMP-00123', 'IT', 'Software Engineer', 'Open Office', 470, 262],
  ['Priya Sharma', 'EMP-00124', 'HR', 'HR Manager', 'Meeting Room A', 140, 100],
  ['Ahmed Hassan', 'EMP-00127', 'Operations', 'Operations Lead', 'Production Area', 150, 330],
  ['Maria Santos', 'EMP-00128', 'Finance', 'Accountant', 'Cafeteria', 820, 110],
  ['Chen Wei', 'EMP-00129', 'Facilities', 'Facilities Technician', 'Corridor', 320, 440],
  ['Li Wei', 'EMP-00131', 'IT', 'Network Engineer', 'Server Room', 850, 400],
  ['Fatima Ali', 'EMP-00135', 'Production', 'Line Supervisor', 'Production Area', 110, 450],
  ['Omar Khalid', 'EMP-00140', 'Sales', 'Account Manager', 'Open Office', 610, 220],
  ['Grace Park', 'EMP-00142', 'HR', 'Recruiter', 'Reception', 510, 450],
  ['Sara Khan', 'EMP-00146', 'Finance', 'Analyst', 'Cafeteria', 900, 190],
  ['Daniel Kim', 'EMP-00151', 'IT', 'QA Engineer', 'Open Office', 330, 210],
  ['Nadia Hussein', 'EMP-00155', 'Operations', 'Planner', 'HR Office', 540, 90],
];

export const PEOPLE: RPerson[] = (() => {
  const r = rng(386);
  const out: RPerson[] = [];
  let n = 200;
  const featByZone = new Map<string, Feat[]>();
  FEATURED.forEach((f) => featByZone.set(f[4], [...(featByZone.get(f[4]) ?? []), f]));
  for (const [key, count] of Object.entries(COUNTS)) {
    const [floor, zname] = key.split('/');
    const z = ZONES.find((x) => x.floor === floor && x.name === zname)!;
    const feats = floor === 'Floor 1' ? (featByZone.get(zname) ?? []) : [];
    for (let k = 0; k < count; k++) {
      const f = feats[k];
      const name = f ? f[0] : `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
      const type: RPerson['type'] = f ? 'Employee' : r() < 0.78 ? 'Employee' : r() < 0.7 ? 'Contractor' : 'Visitor';
      const dept = f ? f[2] : type === 'Visitor' ? 'Visitor' : type === 'Contractor' ? 'Contractor' : DEPTS[Math.floor(r() * DEPTS.length)];
      out.push({
        id: f ? f[1] : `${type === 'Employee' ? 'EMP' : type === 'Contractor' ? 'CON' : 'VIS'}-${String(n++).padStart(5, '0')}`,
        name, initials: ini(name), color: PAL[(out.length * 3) % PAL.length], dept, role: f ? f[3] : type === 'Employee' ? 'Staff' : type,
        type, floor, zoneId: z.id, zone: zname,
        x: f ? f[5] : Math.round(z.x + 14 + r() * (z.w - 28)), y: f ? f[6] : Math.round(z.y + 14 + r() * (z.h - 40)),
        tag: `TAG-${String(4100 + out.length).padStart(5, '0')}`, battery: Math.round(18 + r() * 82), since: Math.round(20 + r() * 236),
        phone: `+971 50 ${300 + (out.length % 600)} ${1000 + out.length * 7}`, featured: !!f, status: 'On-Site',
      });
    }
  }
  const arjun = out.find((p) => p.id === 'EMP-00123')!;
  arjun.walker = [[470, 262], [410, 232], [330, 196], [250, 160], [180, 130]];
  arjun.since = 6;
  arjun.color = 'var(--ka-7c3aed)';
  out.find((p) => p.id === 'EMP-00131')!.color = 'var(--ka-ef4444)';
  // Average dwell 2h 18m
  const avg = out.reduce((a, p) => a + p.since, 0) / out.length;
  out.forEach((p) => p.id !== 'EMP-00123' && (p.since = Math.max(4, Math.round((p.since * 138) / avg))));
  return out;
})();

export const zoneOf = (id: string) => ZONES.find((z) => z.id === id)!;
const hash = (s: string) => [...s].reduce((x, c) => (x * 31 + c.charCodeAt(0)) | 0, 7);

/** Live position for a person at a tick (people jitter inside their zone; walkers follow a path). */
export function positionAt(p: RPerson, tick: number): [number, number] {
  if (p.walker) {
    const w = p.walker;
    const u = (((tick * 0.06) % 2) + 2) % 2;
    const t = u <= 1 ? u : 2 - u;
    const seg = Math.min(w.length - 2, Math.floor(t * (w.length - 1)));
    const f = t * (w.length - 1) - seg;
    return [Math.round(w[seg][0] + (w[seg + 1][0] - w[seg][0]) * f), Math.round(w[seg][1] + (w[seg + 1][1] - w[seg][1]) * f)];
  }
  if (!tick) return [p.x, p.y];
  const z = zoneOf(p.zoneId);
  const h = hash(p.id);
  const amp = p.featured ? 14 : 8;
  const x = p.x + Math.sin(tick * 0.4 + h) * amp;
  const y = p.y + Math.cos(tick * 0.33 + h / 3) * amp * 0.7;
  return [Math.round(Math.min(z.x + z.w - 12, Math.max(z.x + 12, x))), Math.round(Math.min(z.y + z.h - 12, Math.max(z.y + 12, y)))];
}
export const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Map units per metre (the 1000-unit floor is ~80 m wide). */
export const PX_PER_M = 12.5;
export const fmtDur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min} mins`);
export const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
export const minsAgo = (m: number) => clock(new Date(Date.now() - m * 60000));

/** Today's zone visits for a person (newest last). */
export function visitsFor(p: RPerson) {
  const r = rng(hash(p.id));
  const floorZones = ZONES.filter((z) => z.floor === p.floor && z.id !== p.zoneId);
  const out: { zone: string; floor: string; zoneId: string; from: Date; to: Date | null; mins: number }[] = [];
  const start = new Date();
  start.setHours(8, Math.floor(r() * 40), 0, 0);
  let t = start.getTime();
  const end = Date.now() - p.since * 60000;
  const entrance = ZONES.find((z) => z.name === 'Entrance')!;
  out.push({ zone: 'Entrance', floor: 'Ground Floor', zoneId: entrance.id, from: new Date(t), to: new Date(t + 4 * 60000), mins: 4 });
  t += 4 * 60000;
  while (t < end - 10 * 60000) {
    const z = floorZones[Math.floor(r() * floorZones.length)];
    const mins = Math.min(Math.round(12 + r() * 70), Math.round((end - t) / 60000));
    out.push({ zone: z.name, floor: z.floor, zoneId: z.id, from: new Date(t), to: new Date(t + mins * 60000), mins });
    t += mins * 60000;
  }
  out.push({ zone: p.zone, floor: p.floor, zoneId: p.zoneId, from: new Date(end), to: null, mins: p.since });
  return out;
}

/* ---------- Devices ---------- */
export interface Device {
  id: string;
  type: 'UWB Anchor' | 'BLE Gateway' | 'Badge Tag' | 'Wristband' | 'Helmet Tag' | 'Asset Tag';
  floor: string;
  zone: string;
  battery: number;
  signal: number;
  lastSeen: string;
  firmware: string;
  status: 'Online' | 'Offline' | 'Low Battery';
  assigned: string;
}
export const DEVICES: Device[] = (() => {
  const r = rng(77);
  const out: Device[] = [];
  FLOORS.forEach((f, fi) => {
    for (let i = 0; i < 8; i++) {
      const z = ZONES[fi * 8 + i];
      const off = fi === 4 && i === 6;
      out.push({ id: `ANC-${fi}${String(i).padStart(2, '0')}`, type: 'UWB Anchor', floor: f, zone: z.name, battery: 100, signal: off ? 0 : Math.round(70 + r() * 30), lastSeen: off ? '42 min ago' : 'just now', firmware: 'v3.4.1', status: off ? 'Offline' : 'Online', assigned: '—' });
    }
    out.push({ id: `GW-${fi}`, type: 'BLE Gateway', floor: f, zone: ZONES[fi * 8 + 3].name, battery: 100, signal: Math.round(80 + r() * 20), lastSeen: 'just now', firmware: 'v2.9.0', status: 'Online', assigned: '—' });
  });
  PEOPLE.forEach((p, i) => {
    const type: Device['type'] = p.dept === 'Production' || p.type === 'Contractor' ? (i % 2 ? 'Helmet Tag' : 'Wristband') : 'Badge Tag';
    out.push({ id: p.tag, type, floor: p.floor, zone: p.zone, battery: p.battery, signal: Math.round(55 + ((i * 37) % 45)), lastSeen: 'just now', firmware: 'v1.8.2', status: p.battery < 20 ? 'Low Battery' : 'Online', assigned: `${p.name} (${p.id})` });
  });
  for (let i = 0; i < 34; i++) {
    const unassigned = i < 22;
    out.push({ id: `TAG-${String(4600 + i).padStart(5, '0')}`, type: i % 4 === 0 ? 'Asset Tag' : 'Badge Tag', floor: 'Ground Floor', zone: unassigned ? 'Security Desk' : 'Storage', battery: Math.round(30 + r() * 70), signal: unassigned ? 0 : 60, lastSeen: unassigned ? 'in stock' : `${2 + i} h ago`, firmware: 'v1.8.2', status: unassigned ? 'Online' : 'Offline', assigned: unassigned ? 'Unassigned' : '—' });
  }
  return out;
})();

/* ---------- Alerts & SOS (shared across RTLS pages) ---------- */
export interface RAlert {
  id: string;
  time: string;
  min: number;
  person: string;
  personId: string;
  event: string;
  location: string;
  floor: string;
  severity: 'Critical' | 'Warning' | 'Info';
  status: 'Open' | 'Acknowledged' | 'Resolved';
  x: number;
  y: number;
  note?: string;
}
export interface AlertRule {
  id: string;
  name: string;
  trigger: string;
  severity: RAlert['severity'];
  channels: string[];
  enabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class RtlsStore {
  readonly zones = signal<RZone[]>(ZONES.map((z) => ({ ...z })));
  readonly alerts = signal<RAlert[]>(
    (() => {
      const base: Omit<RAlert, 'id' | 'time'>[] = [
        { min: 2, person: 'Li Wei', personId: 'EMP-00131', event: 'Entered Restricted Zone', location: 'Server Room', floor: 'Floor 1', severity: 'Critical', status: 'Open', x: 850, y: 400 },
        { min: 7, person: 'Unknown', personId: 'TAG-04388', event: 'SOS Alert', location: 'Floor 2 - Staircase', floor: 'Floor 2', severity: 'Critical', status: 'Open', x: 320, y: 450 },
        { min: 12, person: 'Ramesh Kumar', personId: 'CON-00456', event: 'Prolonged Stay', location: 'Loading Bay', floor: 'Ground Floor', severity: 'Warning', status: 'Open', x: 840, y: 150 },
        { min: 16, person: 'Fatima Ali', personId: 'EMP-00135', event: 'Zone Breach', location: 'Production Area', floor: 'Floor 1', severity: 'Warning', status: 'Acknowledged', x: 110, y: 450 },
        { min: 19, person: 'James Wilson', personId: 'EMP-00162', event: 'Fall Detection', location: 'Warehouse', floor: 'Ground Floor', severity: 'Critical', status: 'Acknowledged', x: 600, y: 260 },
      ];
      const r = rng(55);
      const ev = ['Low Tag Battery', 'Tag Offline', 'Zone Capacity Exceeded', 'After-hours Presence', 'Lone Worker Check-in Missed', 'Zone Breach', 'Prolonged Stay'];
      const names = ['Tom Baker', 'Aisha Bello', 'Kenji Sato', 'Meera Iyer', 'Lucas Silva', 'Zara Khan', 'Noah Brown', 'Vikram Rao'];
      for (let i = 0; i < 26; i++) {
        const z = ZONES[Math.floor(r() * ZONES.length)];
        const e = ev[i % ev.length];
        base.push({ min: 25 + i * 17, person: names[i % names.length], personId: `EMP-00${300 + i}`, event: e, location: z.name, floor: z.floor, severity: e.includes('Breach') || e.includes('Lone') ? 'Critical' : e.includes('Capacity') || e.includes('Prolonged') ? 'Warning' : 'Info', status: 'Resolved', x: z.x + z.w / 2, y: z.y + z.h / 2 });
      }
      return base.map((a, i) => ({ ...a, id: `AL-${9000 - i}`, time: minsAgo(a.min) }));
    })(),
  );
  readonly rules = signal<AlertRule[]>([
    { id: 'R1', name: 'Restricted zone entry', trigger: 'Unauthorised person enters a restricted zone', severity: 'Critical', channels: ['Push', 'SMS', 'Control room'], enabled: true },
    { id: 'R2', name: 'SOS button pressed', trigger: 'Wearable SOS / panic button', severity: 'Critical', channels: ['Push', 'SMS', 'Control room', 'PA'], enabled: true },
    { id: 'R3', name: 'Fall detection', trigger: 'Tag accelerometer detects a fall', severity: 'Critical', channels: ['Push', 'Control room'], enabled: true },
    { id: 'R4', name: 'Prolonged stay', trigger: 'Dwell exceeds zone max-dwell setting', severity: 'Warning', channels: ['Push'], enabled: true },
    { id: 'R5', name: 'Zone capacity exceeded', trigger: 'Headcount above zone capacity', severity: 'Warning', channels: ['Push', 'Email'], enabled: true },
    { id: 'R6', name: 'Lone worker check-in', trigger: 'No movement for 20 min in a lone-worker zone', severity: 'Critical', channels: ['Push', 'SMS'], enabled: true },
    { id: 'R7', name: 'Low tag battery', trigger: 'Battery below 20%', severity: 'Info', channels: ['Email'], enabled: true },
    { id: 'R8', name: 'After-hours presence', trigger: 'Person on site 22:00–05:00', severity: 'Info', channels: ['Email'], enabled: false },
  ]);
  readonly open = computed(() => this.alerts().filter((a) => a.status !== 'Resolved'));

  setStatus(id: string, status: RAlert['status'], note?: string) {
    this.alerts.update((l) => l.map((a) => (a.id === id ? { ...a, status, note: note ?? a.note } : a)));
  }
  raise(a: Omit<RAlert, 'id' | 'time' | 'min'>) {
    this.alerts.update((l) => [{ ...a, id: `AL-${9100 + l.length}`, time: clock(new Date()), min: 0 }, ...l]);
  }
  updateZone(id: string, c: Partial<RZone>) {
    this.zones.update((l) => l.map((z) => (z.id === id ? { ...z, ...c } : z)));
  }
}
