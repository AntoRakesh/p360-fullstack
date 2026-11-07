// Shared hard-coded data for Physical Access Control.
import { rng } from '../dashboards/demo-data';
import { PEOPLE } from '../people/people.data';

export type DoorStatus = 'Online' | 'Offline' | 'Alarm';
export interface Door {
  id: string;
  name: string;
  site: string;
  floor: string;
  location: string;
  type: string;
  reader: string;
  controller: string;
  status: DoorStatus;
  locked: boolean;
  contact: 'Closed' | 'Open';
  level: string;
  schedule: string;
  firmware: string;
  x: number;
  y: number;
}

type DoorSeed = [string, string, string, string, string, number?, number?];
// name, site, floor, type, level, x, y (map position for Head Office floors)
const SEED: DoorSeed[] = [
  ['Main Entrance', 'Head Office', 'G', 'Entrance', 'General', 60, 120],
  ['Side Entrance', 'Head Office', 'G', 'Entrance', 'General', 330, 40],
  ['Reception', 'Head Office', 'G', 'Office', 'General', 150, 60],
  ['Lobby Turnstile 1', 'Head Office', 'G', 'Turnstile', 'General', 200, 140],
  ['Lobby Turnstile 2', 'Head Office', 'G', 'Turnstile', 'General', 230, 140],
  ['Parking Gate', 'Head Office', 'B1', 'Gate', 'General', 80, 160],
  ['Server Room', 'Head Office', 'F1', 'Restricted', 'Server Room', 250, 70],
  ['Lift Lobby F1', 'Head Office', 'F1', 'Lift', 'General', 140, 120],
  ['Network Room', 'Head Office', 'F1', 'Restricted', 'Server Room', 330, 150],
  ['Open Office F1', 'Head Office', 'F1', 'Office', 'General', 90, 50],
  ['R&D Lab', 'Head Office', 'F2', 'Restricted', 'R&D Lab', 230, 60],
  ['Lift Lobby F2', 'Head Office', 'F2', 'Lift', 'General', 140, 120],
  ['Prototype Store', 'Head Office', 'F2', 'Restricted', 'R&D Lab', 320, 140],
  ['Finance Office', 'Head Office', 'F3', 'Restricted', 'Finance', 200, 70],
  ['HR Office', 'Head Office', 'F3', 'Office', 'HR', 300, 70],
  ['Meeting Room', 'Head Office', 'F5', 'Office', 'General', 180, 100],
  ['Executive Floor', 'Head Office', 'F6', 'Restricted', 'Executive', 220, 80],
  ['Roof Access', 'Head Office', 'F6', 'Restricted', 'Facilities', 340, 40],
  ['Gate 2', 'Manufacturing', 'G', 'Gate', 'Plant'],
  ['Plant Entrance', 'Manufacturing', 'G', 'Entrance', 'Plant'],
  ['Production Line A', 'Manufacturing', 'G', 'Office', 'Plant'],
  ['Production Line B', 'Manufacturing', 'G', 'Office', 'Plant'],
  ['Chemical Store', 'Manufacturing', 'G', 'Restricted', 'Hazmat'],
  ['Quality Lab', 'Manufacturing', 'F1', 'Restricted', 'Plant'],
  ['Plant Canteen', 'Manufacturing', 'G', 'Office', 'General'],
  ['Warehouse Gate', 'Warehouse', 'G', 'Gate', 'Warehouse'],
  ['Loading Bay', 'Warehouse', 'G', 'Gate', 'Warehouse'],
  ['Cold Store', 'Warehouse', 'G', 'Restricted', 'Warehouse'],
  ['Dispatch Office', 'Warehouse', 'G', 'Office', 'Warehouse'],
  ['Data Hall A', 'Data Center', 'G', 'Restricted', 'Data Center'],
  ['Data Hall B', 'Data Center', 'G', 'Restricted', 'Data Center'],
  ['Security Gate', 'Data Center', 'G', 'Gate', 'Data Center'],
  ['Regional Office Entrance', 'Regional Office', 'G', 'Entrance', 'General'],
  ['Tech Center Lab', 'Tech Center', 'F1', 'Restricted', 'R&D Lab'],
  ['Logistics Hub Gate', 'Logistics Hub', 'G', 'Gate', 'Warehouse'],
];
const READERS = ['HID Signo 40', 'HID iCLASS SE R40', 'Suprema FaceStation F2', 'ZKTeco SpeedFace V5', 'Turnstile Reader TR-3'];

export const DOORS: Door[] = (() => {
  const r = rng(1024);
  const out: Door[] = SEED.map(([name, site, floor, type, level, x, y], i) => ({
    id: `DR-${String(101 + i)}`, name, site, floor, location: `${site}${floor !== 'G' ? ' · ' + floor : ''}`, type,
    reader: READERS[i % READERS.length], controller: `CTRL-${site.split(' ')[0].toUpperCase().slice(0, 3)}-${1 + (i % 4)}`,
    status: 'Online', locked: type !== 'Turnstile', contact: 'Closed', level, schedule: type === 'Entrance' || type === 'Turnstile' ? 'Business Hours' : type === 'Restricted' ? '24x7 (restricted)' : 'Business Hours',
    firmware: `v${4 + (i % 2)}.${2 + (i % 5)}.${i % 9}`, x: x ?? 40 + r() * 340, y: y ?? 30 + r() * 140,
  }));
  const sites = ['Head Office', 'Manufacturing', 'Warehouse', 'Regional Office', 'Tech Center', 'Data Center', 'Logistics Hub', 'Retail Stores'];
  let k = 1;
  while (out.length < 102) {
    const site = sites[out.length % sites.length];
    const floor = site === 'Head Office' ? ['F1', 'F2', 'F3', 'F4', 'F5'][k % 5] : 'G';
    out.push({
      id: `DR-${String(101 + out.length)}`, name: `${site === 'Retail Stores' ? 'Store ' + ((k % 12) + 1) + ' Staff Door' : 'Office Door ' + floor + '-' + k}`, site, floor,
      location: `${site}${floor !== 'G' ? ' · ' + floor : ''}`, type: 'Office', reader: READERS[k % READERS.length], controller: `CTRL-${site.split(' ')[0].toUpperCase().slice(0, 3)}-${1 + (k % 4)}`,
      status: 'Online', locked: true, contact: 'Closed', level: 'General', schedule: 'Business Hours', firmware: `v4.${k % 6}.${k % 9}`, x: 40 + r() * 340, y: 30 + r() * 140,
    });
    k++;
  }
  // 4 offline, 2 alarm (matches the reference design).
  ['Server Room', 'Data Hall B', 'Cold Store'].forEach((n) => {
    const d = out.find((x) => x.name === n);
    if (d) d.status = 'Offline';
  });
  out[80].status = 'Offline';
  ['Warehouse Gate', 'Roof Access'].forEach((n) => {
    const d = out.find((x) => x.name === n)!;
    d.status = 'Alarm';
    d.contact = 'Open';
  });
  return out;
})();
export const doorByName = (n: string) => DOORS.find((d) => d.name === n);

/* ---------- Access events ---------- */
export type EventKind = 'Access Granted' | 'Access Denied' | 'Door Held Open' | 'Door Forced Open' | 'Request to Exit';
export interface AccessEvent {
  id: string;
  time: string;
  ts: number;
  name: string;
  initials: string;
  avatar: string;
  personId: string;
  cred: string;
  door: string;
  location: string;
  site: string;
  kind: EventKind;
  reason: string;
  result: 'Granted' | 'Denied' | 'Alarm' | 'Info';
  method: string;
}
export const DENY_REASONS = ['Invalid Credential', 'Restricted Time', 'No Permission', 'Expired Card', 'Anti-Passback'];
export const METHODS = ['Card', 'Face', 'Mobile', 'PIN + Card'];
const credOf = (t: string) => (t === 'Employee' ? 'Employee' : t === 'Contractor' ? 'Contractor' : t === 'Visitor' ? 'Visitor' : t === 'Temporary' ? 'Temporary' : 'Other');

const FEATURED: [string, string, string, string, EventKind, string][] = [
  ['Arjun Mehta', 'EMP-00123', 'Employee', 'Main Entrance', 'Access Granted', ''],
  ['Priya Sharma', 'EMP-00124', 'Employee', 'R&D Lab', 'Access Granted', ''],
  ['Unknown Person', '-', 'Visitor', 'Server Room', 'Access Denied', 'Invalid Credential'],
  ['Ramesh Kumar', 'CON-00456', 'Contractor', 'Loading Bay', 'Access Granted', ''],
  ['Fatima Ali', 'EMP-00128', 'Employee', 'Finance Office', 'Access Granted', ''],
  ['Ahmed Hassan', 'EMP-00127', 'Employee', 'Side Entrance', 'Access Denied', 'Restricted Time'],
  ['Maria Santos', 'VIS-00982', 'Visitor', 'Meeting Room', 'Access Granted', ''],
  ['Li Wei', 'EMP-00129', 'Employee', 'Main Entrance', 'Access Granted', ''],
];

/** Builds `count` events ending now, newest first (deterministic per seed). */
export function makeEvents(count: number, seed: number, spanMinutes: number, endTs = Date.now()): AccessEvent[] {
  const r = rng(seed);
  const people = PEOPLE.slice(0, 4000);
  const doors = DOORS;
  const out: AccessEvent[] = [];
  for (let i = 0; i < count; i++) {
    // more traffic in the morning and around lunch
    const u = r();
    const ts = endTs - Math.floor(Math.pow(u, 1.15) * spanMinutes) * 60000 - Math.floor(r() * 60000);
    const p = people[Math.floor(r() * people.length)];
    const d = doors[Math.floor(Math.pow(r(), 2.2) * doors.length)];
    const x = r();
    const kind: EventKind = x < 0.847 ? 'Access Granted' : x < 0.951 ? 'Access Denied' : x < 0.975 ? 'Request to Exit' : x < 0.992 ? 'Door Held Open' : 'Door Forced Open';
    const reason = kind === 'Access Denied' ? DENY_REASONS[Math.floor(r() * r() * DENY_REASONS.length)] : '';
    const noPerson = kind === 'Door Held Open' || kind === 'Door Forced Open';
    out.push({
      id: `AE-${seed}-${i}`, ts, time: new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      name: noPerson ? '—' : p.name, initials: noPerson ? '!' : p.initials, avatar: noPerson ? '#ef4444' : p.avatar, personId: noPerson ? '-' : p.id,
      cred: noPerson ? 'System' : credOf(p.type), door: d.name, location: d.location, site: d.site, kind, reason,
      result: kind === 'Access Granted' || kind === 'Request to Exit' ? (kind === 'Request to Exit' ? 'Info' : 'Granted') : kind === 'Access Denied' ? 'Denied' : 'Alarm',
      method: METHODS[Math.floor(r() * METHODS.length)],
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

/** Today's events: featured rows from the design on top + generated history since midnight. */
export const TODAY_EVENTS: AccessEvent[] = (() => {
  const now = Date.now();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const span = Math.max(60, Math.floor((now - midnight.getTime()) / 60000) - 10);
  const featured: AccessEvent[] = FEATURED.map(([name, id, cred, door, kind, reason], i) => {
    const ts = now - (i * 47 + 12) * 1000;
    const p = PEOPLE.find((x) => x.id === id);
    const d = doorByName(door)!;
    return {
      id: `AE-F-${i}`, ts, time: new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      name, initials: name === 'Unknown Person' ? '?' : name.split(' ').map((x) => x[0]).join(''), avatar: p?.avatar ?? '#64748b', personId: id, cred,
      door, location: d.location, site: d.site, kind, reason, result: kind === 'Access Granted' ? 'Granted' : 'Denied', method: i % 2 ? 'Card' : 'Face',
    };
  });
  return [...featured, ...makeEvents(2838, 7, span, now - 10 * 60000)];
})();

/** 7-day history for the Access Logs page. */
export const HISTORY: AccessEvent[] = (() => {
  // Previous 6 days, ending at midnight (today's events come from TODAY_EVENTS).
  const midnight = new Date().setHours(0, 0, 0, 0);
  return [...TODAY_EVENTS, ...makeEvents(9000, 99, 6 * 24 * 60, midnight).map((e) => ({ ...e, id: e.id + 'h' }))].sort((a, b) => b.ts - a.ts);
})();

export const ACCESS_LEVELS = ['General', 'Server Room', 'R&D Lab', 'Finance', 'HR', 'Executive', 'Facilities', 'Plant', 'Hazmat', 'Warehouse', 'Data Center'];
