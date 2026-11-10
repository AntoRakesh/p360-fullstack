// Hard-coded Tasks & Workforce Operations dataset + a root store shared by all task pages.
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { rng } from '../dashboards/demo-data';
import { MapZone } from '../rtls/floor-plan';

export type TplStatus = 'Active' | 'Inactive';
export type Lifecycle = 'Published' | 'Draft' | 'Archived';
export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
export interface Step {
  text: string;
  required: boolean;
  photo?: boolean;
}
export interface Template {
  id: string;
  name: string;
  category: string;
  dept: string;
  frequency: string;
  duration: number;
  applicableTo: string;
  status: TplStatus;
  lifecycle: Lifecycle;
  priority: Priority;
  sites: string[];
  tags: string[];
  description: string;
  icon: string;
  color: string;
  updatedAt: string;
  updatedBy: string;
  steps: Step[];
  assignMode: string;
  team: string;
  shift: string;
  startTime: string;
  days: string[];
  slaResponse: number;
  slaResolve: number;
  escL1: string;
  escL2: string;
  verify: string;
  usage30: number;
}

export interface Category {
  name: string;
  count: number;
  icon: string;
  /** Icon colour in the categories list. */
  tint: string;
  /** Bar colour in the completion-by-category chart. */
  bar: string;
  completion: number;
}
/** Category roll-up from the reference image (published templates only = 118). */
export const CATEGORIES: Category[] = [
  { name: 'Housekeeping', count: 28, icon: 'tasks-broom', tint: 'var(--kb-22c55e)', bar: 'var(--ka-f43f5e)', completion: 92 },
  { name: 'Security', count: 18, icon: 'shield', tint: 'var(--kb-10b981)', bar: 'var(--ka-f59e0b)', completion: 88 },
  { name: 'Facility Maintenance', count: 16, icon: 'tasks-wrench', tint: 'var(--kb-22c55e)', bar: 'var(--ka-10b981)', completion: 84 },
  { name: 'Safety', count: 12, icon: 'flame', tint: 'var(--kb-f97316)', bar: 'var(--ka-f472b6)', completion: 80 },
  { name: 'IT Support', count: 10, icon: 'cpu', tint: 'var(--kb-8b5cf6)', bar: 'var(--ka-3b82f6)', completion: 78 },
  { name: 'Canteen', count: 8, icon: 'utensils', tint: 'var(--kb-f97316)', bar: 'var(--ka-c7c2ea)', completion: 76 },
  { name: 'Asset Management', count: 8, icon: 'box', tint: 'var(--kb-3b82f6)', bar: 'var(--ka-7c3aed)', completion: 70 },
  { name: 'Facilities', count: 7, icon: 'building', tint: 'var(--kb-3b82f6)', bar: 'var(--ka-cfcbe8)', completion: 68 },
  { name: 'Others', count: 11, icon: 'layers', tint: 'var(--kb-f59e0b)', bar: 'var(--ka-c4cde0)', completion: 62 },
];
export const CAT_NAMES = CATEGORIES.map((c) => c.name);
export const catOf = (category: string) => (CAT_NAMES.includes(category) && category !== 'Others' ? category : 'Others');
export const catMeta = (category: string) => CATEGORIES.find((c) => c.name === catOf(category))!;

export const DEPTS = ['Facilities', 'Security', 'Engineering', 'IT', 'HSE', 'Food Services', 'Administration'];
export const TASK_SITES = ['Head Office', 'Manufacturing', 'Warehouse', 'Logistics Hub', 'Retail Stores', 'Data Center'];
export const FREQUENCIES = ['Hourly', 'Shift-wise', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'On Demand'];
export const PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Critical'];
export const ROLES = ['Cleaning Staff', 'Security Guards', 'Technician', 'Safety Team', 'IT Team', 'Facility Staff', 'Asset Team', 'Maintenance Team', 'Canteen Staff'];
export const TAG_OPTIONS = ['Cleaning', 'Office', 'Patrol', 'Compliance', 'Inspection', 'Hygiene', 'Audit', 'Night Shift', 'Critical', 'Outdoor'];
export const ESCALATION_ROLES = ['Shift Supervisor', 'Facility Manager', 'Security Manager', 'HSE Manager', 'IT Manager', 'Site Head', 'Operations Director'];

const CAT_DEFAULTS: Record<string, { dept: string; role: string; icon: string; color: string; tags: string[]; esc: [string, string] }> = {
  Housekeeping: { dept: 'Facilities', role: 'Cleaning Staff', icon: 'tasks-broom', color: 'var(--ka-64748b)', tags: ['Cleaning', 'Hygiene'], esc: ['Shift Supervisor', 'Facility Manager'] },
  Security: { dept: 'Security', role: 'Security Guards', icon: 'shield', color: 'var(--ka-2563eb)', tags: ['Patrol', 'Compliance'], esc: ['Shift Supervisor', 'Security Manager'] },
  'Facility Maintenance': { dept: 'Engineering', role: 'Technician', icon: 'tasks-wrench', color: 'var(--ka-1d4ed8)', tags: ['Inspection'], esc: ['Shift Supervisor', 'Facility Manager'] },
  Safety: { dept: 'HSE', role: 'Safety Team', icon: 'flame', color: 'var(--ka-ef4444)', tags: ['Compliance', 'Critical'], esc: ['HSE Manager', 'Site Head'] },
  'IT Support': { dept: 'IT', role: 'IT Team', icon: 'cpu', color: 'var(--ka-334155)', tags: ['Inspection'], esc: ['IT Manager', 'Site Head'] },
  Canteen: { dept: 'Food Services', role: 'Canteen Staff', icon: 'utensils', color: 'var(--ka-d97706)', tags: ['Hygiene', 'Audit'], esc: ['Shift Supervisor', 'Facility Manager'] },
  'Asset Management': { dept: 'Administration', role: 'Asset Team', icon: 'box', color: 'var(--ka-0d9488)', tags: ['Audit'], esc: ['Facility Manager', 'Site Head'] },
  Facilities: { dept: 'Facilities', role: 'Maintenance Team', icon: 'tree', color: 'var(--ka-65a30d)', tags: ['Outdoor'], esc: ['Facility Manager', 'Site Head'] },
  Others: { dept: 'Administration', role: 'Facility Staff', icon: 'layers', color: 'var(--ka-7c3aed)', tags: ['Office'], esc: ['Shift Supervisor', 'Facility Manager'] },
};

const STEPS: Record<string, string[]> = {
  Housekeeping: ['Collect cleaning kit & PPE', 'Dust surfaces and desks', 'Vacuum / mop floors', 'Empty and reline bins', 'Sanitise high-touch points', 'Photo of completed area'],
  Security: ['Collect patrol device', 'Scan start checkpoint', 'Check doors, windows & locks', 'Inspect CCTV blind spots', 'Report any anomaly', 'Scan end checkpoint'],
  'Facility Maintenance': ['Isolate equipment', 'Inspect filters and belts', 'Record temperature & pressure', 'Check for leaks / noise', 'Restore and test run', 'Photo of gauge readings'],
  Safety: ['Check extinguisher pressure & tag', 'Inspect fire exits are clear', 'Test emergency lighting', 'Verify alarm panel status', 'Log defects', 'Supervisor sign-off'],
  'IT Support': ['Check workstation power-on', 'Verify network connectivity', 'Inspect peripherals', 'Update asset tag status', 'Close ticket'],
  Canteen: ['Check food storage temperatures', 'Inspect food prep surfaces', 'Verify staff hygiene (gloves, caps)', 'Check pest control traps', 'Photo of kitchen area'],
  'Asset Management': ['Scan asset tag', 'Verify location & custodian', 'Check physical condition', 'Update asset register'],
  Facilities: ['Collect tools', 'Trim hedges & lawn edges', 'Water plants', 'Clear green waste', 'Photo of completed area'],
  Others: ['Review request', 'Prepare area / materials', 'Execute task', 'Confirm with requester'],
};
const stepsFor = (cat: string): Step[] => STEPS[catOf(cat)].map((text, i, a) => ({ text, required: i < a.length - 1 || /photo|sign-off/i.test(text), photo: /photo/i.test(text) }));

const tpl = (id: number, name: string, category: string, frequency: string, duration: number, applicableTo: string, status: TplStatus, icon: string, color: string, updatedAt: string, updatedBy: string, extra: Partial<Template> = {}): Template => {
  const d = CAT_DEFAULTS[catOf(category)];
  return {
    id: `TPL-${String(id).padStart(4, '0')}`, name, category, dept: d.dept, frequency, duration, applicableTo, status, lifecycle: 'Published', priority: 'Medium',
    sites: ['All Sites'], tags: d.tags, description: `${name} procedure for ${applicableTo.toLowerCase()}, following the standard ${catOf(category).toLowerCase()} checklist.`,
    icon, color, updatedAt, updatedBy, steps: stepsFor(category), assignMode: 'Auto (Round-robin)', team: applicableTo, shift: 'Morning Shift', startTime: '08:00',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], slaResponse: 15, slaResolve: Math.max(30, duration * 2), escL1: d.esc[0], escL2: d.esc[1], verify: 'Supervisor review', usage30: 0, ...extra,
  };
};

/** The ten templates visible in the reference image, in its order. */
const IMAGE_TEMPLATES: Template[] = [
  tpl(1, 'General Cleaning', 'Housekeeping', 'Daily', 30, 'Cleaning Staff', 'Active', 'tasks-broom', 'var(--ka-64748b)', '2026-10-14T09:12', 'John Doe', {
    description: 'Standard cleaning task for office areas including floors, desks and common areas.', tags: ['Cleaning', 'Office'], usage30: 612,
  }),
  tpl(2, 'Security Patrol Check', 'Security', 'Hourly', 15, 'Security Guards', 'Active', 'shield', 'var(--ka-2563eb)', '2026-10-13T17:48', 'Priya Sharma', { priority: 'High', usage30: 744, shift: '24x7 Rotation', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }),
  tpl(3, 'HVAC Inspection', 'Facility Maintenance', 'Daily', 20, 'Technician', 'Active', 'tasks-wrench', 'var(--ka-1d4ed8)', '2026-10-12T11:20', 'Ahmed Hassan', { usage30: 186 }),
  tpl(4, 'Fire Safety Inspection', 'Safety', 'Weekly', 30, 'Safety Team', 'Active', 'flame', 'var(--ka-ef4444)', '2026-10-11T15:30', 'Maria Santos', { priority: 'Critical', usage30: 64, verify: 'Photo + Supervisor' }),
  tpl(5, 'IT Equipment Check', 'IT Support', 'Weekly', 20, 'IT Team', 'Active', 'cpu', 'var(--ka-334155)', '2026-10-09T10:05', 'Kenji Sato', { usage30: 52 }),
  tpl(6, 'Meeting Room Setup', 'Facility Services', 'On Demand', 15, 'Facility Staff', 'Active', 'tasks-presentation', 'var(--ka-92400e)', '2026-10-10T13:15', 'Ramesh Kumar', { usage30: 238, assignMode: 'Nearest available' }),
  tpl(7, 'Waste Disposal', 'Housekeeping', 'Daily', 10, 'Cleaning Staff', 'Active', 'tasks-recycle', 'var(--ka-16a34a)', '2026-10-08T08:40', 'John Doe', { usage30: 318 }),
  tpl(8, 'Asset Verification', 'Asset Management', 'Monthly', 25, 'Asset Team', 'Active', 'box', 'var(--ka-0d9488)', '2026-10-06T16:10', 'Grace Park', { usage30: 41 }),
  tpl(9, 'Landscape Maintenance', 'Facilities', 'Weekly', 45, 'Maintenance Team', 'Inactive', 'tree', 'var(--ka-65a30d)', '2026-10-02T09:00', 'Tom Baker', { usage30: 0 }),
  tpl(10, 'Canteen Hygiene Check', 'Canteen', 'Daily', 20, 'Canteen Staff', 'Active', 'utensils', 'var(--ka-d97706)', '2026-10-05T07:45', 'Layla Haddad', { usage30: 96 }),
];

const NAME_POOLS: Record<string, [string[], string[]]> = {
  Housekeeping: [['Washroom Cleaning', 'Pantry Cleaning', 'Glass & Window Cleaning', 'Carpet Vacuuming', 'Desk Sanitisation', 'Deep Cleaning'], ['Lobby', 'Floor 1', 'Floor 2', 'Floor 3', 'Warehouse', 'Plant']],
  Security: [['Perimeter Patrol', 'Gate Inspection', 'Key Control Audit', 'CCTV Health Check', 'Night Lock-up Round', 'Visitor Badge Audit'], ['Head Office', 'Warehouse', 'Plant', 'Car Park']],
  'Facility Maintenance': [['Chiller Inspection', 'Generator Test Run', 'Lift Inspection', 'Plumbing Check', 'Lighting Check', 'Electrical Panel Check'], ['Block A', 'Block B', 'Plant']],
  Safety: [['First Aid Kit Check', 'Emergency Light Test', 'Eyewash Station Check', 'PPE Compliance Audit', 'Spill Kit Inspection', 'Exit Route Check'], ['Plant', 'Warehouse']],
  'IT Support': [['Server Room Check', 'Printer Maintenance', 'Wi-Fi Survey', 'AV Equipment Check', 'Backup Verification'], ['Head Office', 'Data Center']],
  Canteen: [['Kitchen Deep Clean', 'Cold Room Temperature Log', 'Dining Area Reset', 'Pest Control Check'], ['Main Canteen', 'Plant Canteen']],
  'Asset Management': [['Laptop Audit', 'Furniture Tagging', 'Tool Crib Audit', 'Vehicle Inspection'], ['Head Office', 'Warehouse']],
  Facilities: [['Irrigation Check', 'Parking Line Painting', 'Signage Inspection', 'Façade Cleaning'], ['North', 'South']],
  Others: [['Mailroom Sorting', 'Reception Opening', 'Pest Control Visit', 'Parking Allocation', 'Event Setup'], ['Head Office', 'Retail Stores']],
};
const OTHER_CATS = ['Facility Services', 'Reception', 'Pest Control', 'Logistics', 'Parking'];
const UPDATERS = ['John Doe', 'Priya Sharma', 'Ahmed Hassan', 'Maria Santos', 'Ramesh Kumar', 'Grace Park', 'Kenji Sato', 'Tom Baker'];

export const SEED_TEMPLATES: Template[] = (() => {
  const r = rng(128);
  const out = [...IMAGE_TEMPLATES];
  const have = (c: string) => out.filter((t) => catOf(t.category) === c && t.lifecycle === 'Published').length;
  let n = 11;
  let inactive = 15; // + Landscape Maintenance = 16 inactive, 102 active
  for (const c of CATEGORIES) {
    const [bases, areas] = NAME_POOLS[c.name];
    const d = CAT_DEFAULTS[c.name];
    let k = 0;
    while (have(c.name) < c.count) {
      const name = `${bases[k % bases.length]} – ${areas[Math.floor(k / bases.length) % areas.length]}`;
      const off = Math.floor(r() * 40) + 6;
      const dt = new Date(2026, 9, 14 - off, 7 + Math.floor(r() * 10), Math.floor(r() * 60));
      const status: TplStatus = inactive > 0 && k % 3 === 2 && c.name !== 'Housekeeping' ? 'Inactive' : inactive > 0 && c.name === 'Housekeeping' && k % 9 === 8 ? 'Inactive' : 'Active';
      if (status === 'Inactive') inactive--;
      out.push(
        tpl(n++, name, c.name === 'Others' ? OTHER_CATS[k % OTHER_CATS.length] : c.name, FREQUENCIES[Math.floor(r() * FREQUENCIES.length)], [10, 15, 20, 25, 30, 45, 60][Math.floor(r() * 7)], d.role, status, d.icon, d.color,
          `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
          UPDATERS[Math.floor(r() * UPDATERS.length)], { priority: PRIORITIES[Math.floor(r() * 3)], usage30: status === 'Active' ? Math.floor(r() * 140) + 8 : 0, sites: r() < 0.6 ? ['All Sites'] : [TASK_SITES[Math.floor(r() * TASK_SITES.length)]] }),
      );
      k++;
    }
  }
  // 10 not yet published (drafts + archived) => 128 total
  const drafts = ['Pantry Restock Check', 'Hand Sanitiser Refill', 'Fire Door Audit', 'Badge Printer Service', 'EV Charger Inspection', 'Roof Drain Clearing', 'Solar Panel Cleaning', 'Locker Room Audit', 'Old Patrol Route v1', 'Legacy HVAC Log'];
  const dcats = ['Housekeeping', 'Housekeeping', 'Safety', 'IT Support', 'Facility Maintenance', 'Facilities', 'Facilities', 'Security', 'Security', 'Facility Maintenance'];
  drafts.forEach((name, i) => {
    const d = CAT_DEFAULTS[dcats[i]];
    out.push(tpl(n++, name, dcats[i], 'Weekly', 20, d.role, 'Inactive', d.icon, d.color, `2026-10-${String(1 + i).padStart(2, '0')}T10:00`, UPDATERS[i % UPDATERS.length], { lifecycle: i < 8 ? 'Draft' : 'Archived' }));
  });
  return out;
})();

/* ---------- Workforce ---------- */
export interface Worker {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  team: string;
  site: string;
  shift: string;
  status: 'On Duty' | 'On Break' | 'Off Duty';
  quality: number;
  phone: string;
}
const WNAMES = [
  'Arjun Mehta', 'Priya Nair', 'Ali Hassan', 'Maria Garcia', 'Chen Wei', 'Fatima Khan', 'Omar Khalid', 'Grace Park', 'Ravi Shankar', 'Sara Lee',
  'Daniel Kim', 'Nadia Hussein', 'Vikram Rao', 'Aisha Bello', 'Kenji Sato', 'Layla Haddad', 'Tom Baker', 'Hannah Lee', 'Yusuf Rahman', 'Meera Iyer',
  'Lucas Silva', 'Zara Khan', 'Noah Brown', 'Sofia Rossi', 'Ibrahim Musa', 'Chloe Martin', 'Rahul Verma', 'Emma Wilson', 'Joseph Mathew', 'Anita Das',
  'Samir Patel', 'Lina Haddad', 'Peter Okafor', 'Rosa Diaz', 'Hamza Ali', 'Julia Novak',
];
const W_ROLES = ['Cleaning Staff', 'Cleaning Staff', 'Security Guards', 'Cleaning Staff', 'Technician', 'Security Guards', 'Facility Staff', 'Safety Team', 'Technician', 'Canteen Staff', 'IT Team', 'Cleaning Staff'];
const PAL = ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0d9488)', 'var(--ka-ca8a04)', 'var(--ka-db2777)', 'var(--ka-16a34a)', 'var(--ka-ea580c)', 'var(--ka-475569)'];
export const TEAMS: Record<string, string> = {
  'Cleaning Staff': 'Housekeeping Team A', 'Security Guards': 'Security Team', Technician: 'MEP Technicians', 'Facility Staff': 'Facility Services',
  'Safety Team': 'HSE Team', 'Canteen Staff': 'Canteen Crew', 'IT Team': 'IT Field Support', 'Asset Team': 'Asset Control', 'Maintenance Team': 'Grounds Team',
};
export const WORKERS: Worker[] = WNAMES.map((name, i) => {
  const role = i === 34 ? 'Asset Team' : i === 35 ? 'Maintenance Team' : W_ROLES[i % W_ROLES.length];
  return {
    id: `EMP-${String(2101 + i * 7)}`, name, initials: name.split(' ').map((x) => x[0]).join(''), color: PAL[i % PAL.length], role,
    team: role === 'Cleaning Staff' && i % 2 ? 'Housekeeping Team B' : TEAMS[role], site: i % 5 === 4 ? 'Manufacturing' : i % 7 === 6 ? 'Warehouse' : 'Head Office',
    shift: i % 4 === 3 ? 'Evening Shift' : 'Morning Shift', status: i % 11 === 5 ? 'On Break' : i % 4 === 3 ? 'Off Duty' : 'On Duty', quality: 78 + ((i * 37) % 21), phone: `+971 50 ${310 + i} ${4100 + i * 13}`,
  };
});
export const workerById = (id: string | null) => WORKERS.find((w) => w.id === id) ?? null;
export const SUPERVISORS = ['Rex Kumar', 'Grace Park', 'Ahmed Hassan', 'Maria Santos'];

/* ---------- Checkpoints (Head Office – Floor 1 map, 1000 × 560) ---------- */
export const TASK_ZONES: MapZone[] = [
  { id: 'lob', name: 'Lobby & Reception', x: 40, y: 380, w: 250, h: 150, color: 'var(--ka-8b5cf6)' },
  { id: 'off', name: 'Open Office', x: 300, y: 40, w: 330, h: 230, color: 'var(--ka-3b82f6)' },
  { id: 'mtg', name: 'Meeting Rooms', x: 40, y: 40, w: 250, h: 160, color: 'var(--ka-06b6d4)' },
  { id: 'wc', name: 'Washrooms', x: 40, y: 210, w: 120, h: 160, color: 'var(--ka-22c55e)' },
  { id: 'can', name: 'Canteen', x: 640, y: 40, w: 330, h: 200, color: 'var(--ka-f59e0b)' },
  { id: 'srv', name: 'Server Room', x: 170, y: 210, w: 120, h: 160, color: 'var(--ka-64748b)', kind: 'restricted' },
  { id: 'plant', name: 'Plant / HVAC Room', x: 640, y: 250, w: 160, h: 150, color: 'var(--ka-ef4444)', kind: 'hazard' },
  { id: 'store', name: 'Store & Loading', x: 810, y: 250, w: 160, h: 280, color: 'var(--ka-94a3b8)' },
  { id: 'cor', name: 'Main Corridor', x: 300, y: 280, w: 330, h: 250, color: 'var(--ka-94a3b8)', kind: 'open', fill: 0.05 },
];
export interface Checkpoint {
  id: string;
  name: string;
  zone: string;
  x: number;
  y: number;
  tech: 'QR' | 'NFC' | 'BLE Beacon' | 'Geo-fence';
  templateId: string;
  expected: number;
  scans: number;
  lastScan: number; // minutes since midnight, -1 = not today
  lastBy: string;
  active: boolean;
}
const CP_SEED: [string, string, number, number, Checkpoint['tech'], number][] = [
  ['Main Entrance', 'lob', 120, 470, 'NFC', 1], ['Reception Desk', 'lob', 230, 420, 'QR', 0], ['Meeting Room A', 'mtg', 100, 100, 'QR', 5], ['Meeting Room B', 'mtg', 220, 150, 'QR', 5],
  ['Male Washroom', 'wc', 80, 260, 'NFC', 0], ['Female Washroom', 'wc', 120, 330, 'NFC', 0], ['Server Room Door', 'srv', 230, 290, 'BLE Beacon', 4], ['Open Office North', 'off', 380, 90, 'QR', 0],
  ['Open Office South', 'off', 540, 220, 'QR', 0], ['Pantry Zone', 'off', 600, 70, 'QR', 6], ['Canteen Kitchen', 'can', 720, 110, 'NFC', 9], ['Canteen Dining', 'can', 880, 170, 'QR', 9],
  ['AHU-01 Plant Room', 'plant', 690, 300, 'NFC', 2], ['Fire Panel', 'plant', 760, 370, 'NFC', 3], ['Loading Bay Gate', 'store', 900, 490, 'NFC', 1], ['Store Room', 'store', 860, 320, 'QR', 7],
  ['East Fire Exit', 'store', 950, 280, 'NFC', 3], ['Corridor CCTV Blind Spot', 'cor', 420, 400, 'BLE Beacon', 1], ['Lift Lobby', 'cor', 560, 470, 'QR', 0], ['Car Park Gate', 'lob', 60, 520, 'Geo-fence', 1],
];
export const SEED_CHECKPOINTS: Checkpoint[] = CP_SEED.map(([name, zone, x, y, tech, ti], i) => {
  const expected = ti === 1 ? 10 : ti === 0 ? 6 : ti === 9 ? 4 : 2;
  const scans = i === 6 || i === 17 ? Math.max(0, expected - 3) : i === 13 ? 0 : Math.min(expected, Math.round(expected * (0.55 + ((i * 17) % 40) / 100)));
  return {
    id: `CP-${String(101 + i)}`, name, zone, x, y, tech, templateId: IMAGE_TEMPLATES[ti].id, expected, scans, lastScan: scans ? 600 - ((i * 23) % 140) : -1,
    lastBy: WNAMES[(i * 5) % WNAMES.length], active: i !== 19,
  };
});

/* ---------- Today's task instances ---------- */
export type TaskStatus = 'Unassigned' | 'Pending' | 'In Progress' | 'Completed' | 'Verified' | 'Rejected';
export interface TaskItem {
  id: string;
  templateId: string;
  title: string;
  category: string;
  site: string;
  location: string;
  checkpointId: string | null;
  assignee: string | null;
  priority: Priority;
  /** Minutes since midnight. */
  start: number;
  due: number;
  status: TaskStatus;
  stepsDone: number;
  steps: number;
  startedAt?: number;
  completedAt?: number;
  photos: number;
  escalation: number; // 0 none, 1 L1, 2 L2
  verifiedBy?: string;
  rating?: number;
  note?: string;
  source: 'Schedule' | 'Manual' | 'Mobile' | 'Helpdesk';
}
export const DEMO_NOW = 624; // 10:24 AM, as in the reference header

export const SEED_TASKS: TaskItem[] = (() => {
  const r = rng(186);
  const pool = SEED_TEMPLATES.filter((t) => t.status === 'Active');
  const weighted = [...IMAGE_TEMPLATES.filter((t) => t.status === 'Active'), ...IMAGE_TEMPLATES.slice(0, 3), ...IMAGE_TEMPLATES.slice(0, 2), ...pool.slice(10, 60)];
  const out: TaskItem[] = [];
  for (let i = 0; i < 186; i++) {
    const t = weighted[Math.floor(r() * weighted.length)];
    const start = 360 + Math.floor((i / 186) * 720) + Math.floor(r() * 20);
    const due = start + Math.max(t.slaResolve, t.duration + 15);
    const cps = SEED_CHECKPOINTS.filter((c) => c.templateId === t.id);
    const cp = cps.length ? cps[i % cps.length] : null;
    const workers = WORKERS.filter((w) => w.role === t.applicableTo || (t.applicableTo === 'Facility Staff' && w.role === 'Facility Staff'));
    const w = workers.length ? workers[i % workers.length] : WORKERS[i % WORKERS.length];
    let status: TaskStatus;
    if (start + t.duration + 25 < DEMO_NOW) status = r() < 0.07 ? 'In Progress' : r() < 0.06 ? 'Pending' : r() < 0.55 ? 'Verified' : r() < 0.05 ? 'Rejected' : 'Completed';
    else if (start <= DEMO_NOW) status = r() < 0.7 ? 'In Progress' : 'Pending';
    else status = r() < 0.08 ? 'Unassigned' : 'Pending';
    const steps = t.steps.length;
    const done = status === 'Completed' || status === 'Verified' || status === 'Rejected';
    out.push({
      id: `TSK-${10420 + i}`, templateId: t.id, title: t.name, category: t.category, site: i % 6 === 5 ? 'Manufacturing' : i % 9 === 8 ? 'Warehouse' : 'Head Office',
      location: cp ? cp.name : ['Floor 1', 'Floor 2', 'Floor 3', 'Block A', 'Lobby'][i % 5], checkpointId: cp?.id ?? null, assignee: status === 'Unassigned' ? null : w.id,
      priority: t.priority === 'Critical' ? 'Critical' : r() < 0.18 ? 'High' : t.priority, start, due, status, steps, stepsDone: done ? steps : status === 'In Progress' ? 1 + Math.floor(r() * (steps - 1)) : 0,
      startedAt: status === 'In Progress' || done ? start + Math.floor(r() * 10) : undefined, completedAt: done ? start + t.duration + Math.floor(r() * 30) - 6 : undefined,
      photos: done ? 1 + Math.floor(r() * 3) : 0, escalation: status === 'In Progress' && start < DEMO_NOW - 20 && i % 4 === 0 ? 1 : (status === 'In Progress' || status === 'Pending') && due < DEMO_NOW ? 1 + (i % 2) : 0, verifiedBy: status === 'Verified' || status === 'Rejected' ? SUPERVISORS[i % 4] : undefined,
      rating: status === 'Verified' ? 4 + (r() < 0.6 ? 1 : 0) : undefined, note: status === 'Rejected' ? 'Area not cleaned to standard – redo required' : undefined,
      source: i % 13 === 0 ? 'Manual' : i % 17 === 0 ? 'Helpdesk' : 'Schedule',
    });
  }
  return out;
})();

/* ---------- Month figures (reference image KPIs) ---------- */
export const MONTH_BASE = { created: 3842, completed: 3256, overdue: 286 };
export const USAGE_LABELS = ['15 Sep', '18 Sep', '22 Sep', '25 Sep', '29 Sep', '2 Oct', '6 Oct', '9 Oct', '13 Oct', '14 Oct'];
export const USAGE_CREATED = [240, 292, 206, 418, 268, 402, 282, 384, 432, 236];
export const USAGE_DONE = [205, 158, 186, 244, 196, 372, 210, 322, 312, 182];

export interface SlaPolicy {
  id: string;
  name: string;
  category: string;
  priority: Priority;
  response: number;
  resolve: number;
  l1: string;
  l1After: number;
  l2: string;
  l2After: number;
  notify: string[];
  active: boolean;
}
export const SEED_POLICIES: SlaPolicy[] = [
  { id: 'SLA-01', name: 'Critical safety tasks', category: 'Safety', priority: 'Critical', response: 5, resolve: 30, l1: 'HSE Manager', l1After: 0, l2: 'Site Head', l2After: 15, notify: ['Push', 'SMS', 'Email'], active: true },
  { id: 'SLA-02', name: 'Security patrol rounds', category: 'Security', priority: 'High', response: 10, resolve: 45, l1: 'Shift Supervisor', l1After: 10, l2: 'Security Manager', l2After: 30, notify: ['Push', 'SMS'], active: true },
  { id: 'SLA-03', name: 'Housekeeping – standard', category: 'Housekeeping', priority: 'Medium', response: 15, resolve: 60, l1: 'Shift Supervisor', l1After: 15, l2: 'Facility Manager', l2After: 60, notify: ['Push'], active: true },
  { id: 'SLA-04', name: 'MEP / HVAC maintenance', category: 'Facility Maintenance', priority: 'High', response: 15, resolve: 90, l1: 'Shift Supervisor', l1After: 15, l2: 'Facility Manager', l2After: 45, notify: ['Push', 'Email'], active: true },
  { id: 'SLA-05', name: 'IT field support', category: 'IT Support', priority: 'Medium', response: 20, resolve: 120, l1: 'IT Manager', l1After: 30, l2: 'Site Head', l2After: 120, notify: ['Email'], active: true },
  { id: 'SLA-06', name: 'Canteen hygiene', category: 'Canteen', priority: 'High', response: 10, resolve: 40, l1: 'Shift Supervisor', l1After: 10, l2: 'Facility Manager', l2After: 30, notify: ['Push', 'Email'], active: true },
  { id: 'SLA-07', name: 'Asset audits', category: 'Asset Management', priority: 'Low', response: 60, resolve: 480, l1: 'Facility Manager', l1After: 120, l2: 'Site Head', l2After: 480, notify: ['Email'], active: false },
];

export interface TaskEvent {
  at: number;
  text: string;
  who: string;
  icon: string;
  color: string;
}
export interface ReportSchedule {
  id: string;
  report: string;
  frequency: 'Daily' | 'Weekly' | 'Monthly';
  time: string;
  format: string;
  recipients: string;
  next: string;
  active: boolean;
}
export interface Report {
  id: string;
  name: string;
  format: string;
  range: string;
  by: string;
  at: string;
  size: string;
}

export const hhmm = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  const mm = Math.floor(m % 60);
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
export const fmtStamp = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${date}, ${hhmm(d.getHours() * 60 + d.getMinutes())}`;
};
export const durLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? (m % 60) + 'm' : ''}`.trim() : `${m} mins`);

@Injectable({ providedIn: 'root' })
export class TaskStore {
  private readonly app = inject(AppState);
  readonly templates = signal<Template[]>(SEED_TEMPLATES.map((t) => ({ ...t, steps: t.steps.map((s) => ({ ...s })) })));
  readonly tasks = signal<TaskItem[]>(SEED_TASKS.map((t) => ({ ...t })));
  readonly checkpoints = signal<Checkpoint[]>(SEED_CHECKPOINTS.map((c) => ({ ...c })));
  readonly policies = signal<SlaPolicy[]>(SEED_POLICIES.map((p) => ({ ...p })));
  readonly events = signal<TaskEvent[]>([
    { at: 623, text: 'Lighting Check – Block B escalated to L2 · Facility Manager', who: 'SLA Engine', icon: 'tasks-escalate', color: 'var(--ka-ef4444)' },
    { at: 621, text: 'Security Patrol Check completed · 6/6 checkpoints', who: 'Ali Hassan', icon: 'shield-check', color: 'var(--ka-22c55e)' },
    { at: 620, text: 'Pantry Cleaning – Lobby escalated to L2 · Facility Manager', who: 'SLA Engine', icon: 'tasks-escalate', color: 'var(--ka-ef4444)' },
    { at: 618, text: 'HVAC Inspection started at AHU-01 Plant Room', who: 'Chen Wei', icon: 'play', color: 'var(--ka-3b82f6)' },
    { at: 612, text: 'Photo evidence uploaded · Male Washroom', who: 'Arjun Mehta', icon: 'tasks-camera', color: 'var(--ka-7c3aed)' },
    { at: 605, text: 'Fire Panel checkpoint missed – escalated to HSE Manager', who: 'System', icon: 'tasks-escalate', color: 'var(--ka-ef4444)' },
    { at: 602, text: 'Fire Safety Inspection escalated to L2 · Site Head', who: 'SLA Engine', icon: 'tasks-escalate', color: 'var(--ka-ef4444)' },
    { at: 598, text: 'Meeting Room Setup requested via helpdesk', who: 'Front Desk', icon: 'tasks-clipboard', color: 'var(--ka-f59e0b)' },
  ]);
  readonly reports = signal<Report[]>([
    { id: 'R-311', name: 'Daily Task Completion Summary', format: 'PDF', range: '13 Oct 2026', by: 'Rex Kumar', at: '14 Oct 2026, 06:00 AM', size: '412 KB' },
    { id: 'R-310', name: 'SLA Breach Report', format: 'XLSX', range: 'Week 41', by: 'Scheduler', at: '13 Oct 2026, 07:00 AM', size: '186 KB' },
    { id: 'R-309', name: 'Checkpoint Scan Compliance', format: 'CSV', range: 'Sep 2026', by: 'Grace Park', at: '01 Oct 2026, 09:12 AM', size: '1.2 MB' },
    { id: 'R-308', name: 'Worker Productivity Scorecard', format: 'PDF', range: 'Sep 2026', by: 'Scheduler', at: '01 Oct 2026, 07:00 AM', size: '624 KB' },
  ]);
  readonly schedules = signal<ReportSchedule[]>([
    { id: 'SCH-01', report: 'Daily Task Completion Summary', frequency: 'Daily', time: '06:00', format: 'PDF', recipients: 'ops-managers@people360.demo', next: '15 Oct 2026, 06:00 AM', active: true },
    { id: 'SCH-02', report: 'SLA Breach Report', frequency: 'Weekly', time: '07:00', format: 'XLSX', recipients: 'site-heads@people360.demo', next: 'Mon 19 Oct, 07:00 AM', active: true },
    { id: 'SCH-03', report: 'Worker Productivity Scorecard', frequency: 'Monthly', time: '07:00', format: 'PDF', recipients: 'hr-ops@people360.demo', next: '01 Nov 2026, 07:00 AM', active: true },
    { id: 'SCH-04', report: 'Checkpoint Scan Compliance', frequency: 'Weekly', time: '08:00', format: 'CSV', recipients: 'security@people360.demo', next: 'Mon 19 Oct, 08:00 AM', active: false },
  ]);
  readonly ack = signal<Set<string>>(new Set());
  /** Demo clock: minutes since midnight, starts 10:24 AM and advances 1 min per 4 ticks. */
  readonly now = computed(() => DEMO_NOW + Math.floor(this.app.tick() / 4));

  readonly published = computed(() => this.templates().filter((t) => t.lifecycle === 'Published'));
  readonly activeTemplates = computed(() => this.templates().filter((t) => t.lifecycle === 'Published' && t.status === 'Active').length);
  readonly seedDoneToday = SEED_TASKS.filter((t) => ['Completed', 'Verified', 'Rejected'].includes(t.status)).length;
  readonly seedOverdue = SEED_TASKS.filter((t) => isOpen(t) && t.due < DEMO_NOW).length;
  readonly overdueList = computed(() => this.tasks().filter((t) => isOpen(t) && t.due < this.now()));
  readonly doneToday = computed(() => this.tasks().filter((t) => ['Completed', 'Verified', 'Rejected'].includes(t.status)).length);
  readonly month = computed(() => {
    const created = MONTH_BASE.created + (this.tasks().length - SEED_TASKS.length);
    const completed = MONTH_BASE.completed + (this.doneToday() - this.seedDoneToday);
    return { created, completed, overdue: MONTH_BASE.overdue + (this.overdueList().length - this.seedOverdue), rate: +((completed / created) * 100).toFixed(1) };
  });

  constructor() {
    effect(() => {
      const t = this.app.tick();
      untracked(() => t && this.live(t));
    });
  }

  private live(t: number) {
    const now = this.now();
    if (t % 2 === 0) {
      const ip = this.tasks().filter((x) => x.status === 'In Progress' && x.assignee);
      const x = ip[(t / 2) % Math.max(ip.length, 1)];
      if (x) {
        if (x.stepsDone + 1 >= x.steps) this.complete(x.id, x.assignee ? workerById(x.assignee)!.name : 'Worker', true);
        else this.patchTask(x.id, { stepsDone: x.stepsDone + 1, photos: x.photos + (t % 6 === 0 ? 1 : 0) });
      }
    }
    if (t % 5 === 0) {
      const p = this.tasks().find((x) => x.status === 'Pending' && x.assignee && x.start <= now + 5);
      if (p) this.start(p.id, workerById(p.assignee)!.name);
    }
  }

  patchTask(id: string, ch: Partial<TaskItem>) {
    this.tasks.update((l) => l.map((t) => (t.id === id ? { ...t, ...ch } : t)));
  }
  log(text: string, who: string, icon: string, color: string) {
    this.events.update((l) => [{ at: this.now(), text, who, icon, color }, ...l].slice(0, 60));
  }
  start(id: string, who: string) {
    const t = this.tasks().find((x) => x.id === id)!;
    this.patchTask(id, { status: 'In Progress', startedAt: this.now(), stepsDone: Math.max(t.stepsDone, 0) });
    this.log(`${t.title} started${t.checkpointId ? ' at ' + t.location : ''}`, who, 'play', 'var(--ka-3b82f6)');
  }
  complete(id: string, who: string, auto = false) {
    const t = this.tasks().find((x) => x.id === id)!;
    this.patchTask(id, { status: 'Completed', stepsDone: t.steps, completedAt: this.now(), photos: Math.max(t.photos, 1) });
    if (t.checkpointId) this.scan(t.checkpointId, who, false);
    this.log(`${t.title} completed · ${t.location}${auto ? '' : ' (manual)'}`, who, 'tasks-check-circle', 'var(--ka-22c55e)');
  }
  assign(id: string, workerId: string, by = 'Rex Kumar') {
    const t = this.tasks().find((x) => x.id === id)!;
    const w = workerById(workerId)!;
    this.patchTask(id, { assignee: workerId, status: t.status === 'Unassigned' ? 'Pending' : t.status });
    this.log(`${t.title} assigned to ${w.name}`, by, 'user-check', 'var(--ka-7c3aed)');
  }
  verify(id: string, ok: boolean, by: string, note?: string, rating = 5) {
    const t = this.tasks().find((x) => x.id === id)!;
    this.patchTask(id, ok ? { status: 'Verified', verifiedBy: by, rating, note } : { status: 'Rejected', verifiedBy: by, note: note || 'Rework required' });
    this.log(`${t.title} ${ok ? 'verified' : 'rejected – sent for rework'}`, by, ok ? 'shield-check' : 'tasks-x', ok ? 'var(--ka-22c55e)' : 'var(--ka-ef4444)');
  }
  rework(id: string) {
    const t = this.tasks().find((x) => x.id === id)!;
    this.patchTask(id, { status: 'Pending', stepsDone: 0, photos: 0, due: this.now() + 45, escalation: 0 });
    this.log(`${t.title} re-opened for rework`, 'Rex Kumar', 'refresh', 'var(--ka-f59e0b)');
  }
  escalate(id: string, by = 'Rex Kumar') {
    const t = this.tasks().find((x) => x.id === id)!;
    const lvl = Math.min(t.escalation + 1, 2);
    const tp = this.templates().find((x) => x.id === t.templateId);
    this.patchTask(id, { escalation: lvl, priority: lvl === 2 ? 'Critical' : t.priority === 'Low' || t.priority === 'Medium' ? 'High' : t.priority });
    this.log(`${t.title} escalated to L${lvl} · ${lvl === 1 ? tp?.escL1 : tp?.escL2}`, by, 'tasks-escalate', 'var(--ka-ef4444)');
  }
  extend(id: string, mins: number) {
    const t = this.tasks().find((x) => x.id === id)!;
    this.patchTask(id, { due: Math.max(t.due, this.now()) + mins });
    this.log(`${t.title} SLA extended by ${mins} mins`, 'Rex Kumar', 'clock', 'var(--ka-f59e0b)');
  }
  addTask(tp: Template, ch: Partial<TaskItem>) {
    const now = this.now();
    const id = `TSK-${10420 + this.tasks().length}`;
    const task: TaskItem = {
      id, templateId: tp.id, title: tp.name, category: tp.category, site: 'Head Office', location: 'Floor 1', checkpointId: null, assignee: null, priority: tp.priority,
      start: now + 10, due: now + 10 + tp.slaResolve, status: 'Unassigned', stepsDone: 0, steps: tp.steps.length, photos: 0, escalation: 0, source: 'Manual', ...ch,
    };
    if (task.assignee && task.status === 'Unassigned') task.status = 'Pending';
    this.tasks.update((l) => [task, ...l]);
    this.templates.update((l) => l.map((t) => (t.id === tp.id ? { ...t, usage30: t.usage30 + 1 } : t)));
    this.log(`${task.title} created${task.assignee ? ' for ' + workerById(task.assignee)?.name : ''}`, 'Rex Kumar', 'plus', 'var(--ka-7c3aed)');
    return task;
  }
  scan(cpId: string, who: string, log = true) {
    const cp = this.checkpoints().find((c) => c.id === cpId);
    if (!cp) return;
    this.checkpoints.update((l) => l.map((c) => (c.id === cpId ? { ...c, scans: Math.min(c.scans + 1, c.expected + 4), lastScan: this.now(), lastBy: who } : c)));
    if (log) this.log(`Checkpoint scanned · ${cp.name} (${cp.tech})`, who, 'tasks-qr', 'var(--ka-0ea5e9)');
  }
  saveTemplate(t: Template) {
    const exists = this.templates().some((x) => x.id === t.id);
    const n = this.now();
    const updatedAt = `2026-10-14T${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    const saved = { ...t, updatedAt, updatedBy: 'Rex Kumar' };
    if (exists) this.templates.update((l) => l.map((x) => (x.id === t.id ? saved : x)));
    else this.templates.update((l) => [saved, ...l]);
    return saved;
  }
  nextTemplateId() {
    return `TPL-${String(Math.max(...this.templates().map((t) => +t.id.slice(4))) + 1).padStart(4, '0')}`;
  }
}

export const isOpen = (t: TaskItem) => t.status === 'Pending' || t.status === 'In Progress' || t.status === 'Unassigned';
export const statusCls = (s: string) =>
  s === 'Verified' || s === 'Completed' || s === 'Active' || s === 'Published' ? 'tag green' : s === 'In Progress' ? 'tag blue' : s === 'Pending' || s === 'Draft' ? 'tag amber' : s === 'Unassigned' ? 'tag grey' : 'tag red';
export const prioCls = (p: string) => (p === 'Critical' ? 'tag red' : p === 'High' ? 'tag amber' : p === 'Medium' ? 'tag blue' : 'tag grey');
