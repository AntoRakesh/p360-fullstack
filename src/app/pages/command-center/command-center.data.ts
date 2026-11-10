// Hard-coded demo data for the Enterprise Overview Dashboard.

export type KpiKey = 'people' | 'attendance' | 'visitors' | 'contractors' | 'alerts' | 'access';

export interface KpiMeta {
  key: KpiKey;
  label: string;
  change: string;
  up: boolean;
  good: boolean;
  icon: string;
  color: string;
  /** Module page opened when the card is clicked. */
  link: string;
}

export const KPI_BASE: Record<KpiKey, number> = {
  people: 12480,
  attendance: 96.8,
  visitors: 284,
  contractors: 1326,
  alerts: 14,
  access: 56921,
};

export const KPIS: KpiMeta[] = [
  { key: 'people', label: 'Total People on Site', change: '6%', up: true, good: true, icon: 'users', color: 'var(--ka-8b5cf6)', link: '/command-center/people-presence-dashboard' },
  { key: 'attendance', label: 'Attendance Rate', change: '1.2%', up: true, good: true, icon: 'clock', color: 'var(--ka-34d399)', link: '/time-attendance' },
  { key: 'visitors', label: 'Visitors Today', change: '12%', up: true, good: true, icon: 'users', color: 'var(--ka-3b82f6)', link: '/visitor-management' },
  { key: 'contractors', label: 'Contractors on Site', change: '4%', up: true, good: true, icon: 'toolbox', color: 'var(--ka-fb923c)', link: '/contractor-vendor' },
  { key: 'alerts', label: 'Open Alerts', change: '30%', up: false, good: false, icon: 'bell', color: 'var(--ka-ef4444)', link: '/command-center/alerts-action-center' },
  { key: 'access', label: 'Access Events (Today)', change: '8%', up: true, good: true, icon: 'door-open', color: 'var(--ka-a855f7)', link: '/physical-access-control' },
];

export interface Segment {
  label: string;
  value: number;
  color: string;
}

const PALETTE = ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c1a0)', 'var(--ka-22c55e)', 'var(--ka-c4c9d6)'];
const seg = (pairs: [string, number][]): Segment[] => pairs.map(([label, value], i) => ({ label, value, color: PALETTE[i] }));

export const DISTRIBUTION: Record<string, Segment[]> = {
  'By Category': seg([['Employees', 8920], ['Contractors', 1326], ['Visitors', 284], ['Temporary Staff', 520], ['Others', 1430]]),
  'By Site': seg([['Head Office', 4240], ['Manufacturing', 3620], ['Warehouse', 2370], ['Logistics Hub', 1250], ['Others', 1000]]),
  'By Department': seg([['Operations', 5120], ['Engineering', 3340], ['Sales', 1760], ['Support', 1310], ['Others', 950]]),
  'By Employment Type': seg([['Full-time', 8300], ['Part-time', 620], ['Contract', 1846], ['Agency', 520], ['Others', 1194]]),
};

export interface OccRow {
  label: string;
  pct: number;
  delta?: number;
}

export const OCCUPANCY: Record<string, OccRow[]> = {
  Live: [
    { label: 'Head Office', pct: 78 },
    { label: 'Manufacturing', pct: 62 },
    { label: 'Warehouse', pct: 86 },
    { label: 'Logistics Hub', pct: 54 },
    { label: 'Retail Stores', pct: 71 },
    { label: 'Data Center', pct: 48 },
  ],
  Buildings: [
    { label: 'Tower A', pct: 82 },
    { label: 'Tower B', pct: 67 },
    { label: 'Plant 1', pct: 74 },
    { label: 'Plant 2', pct: 58 },
    { label: 'Depot North', pct: 45 },
    { label: 'Depot South', pct: 63 },
  ],
  Zones: [
    { label: 'Reception', pct: 91 },
    { label: 'Open Office', pct: 76 },
    { label: 'Production Line', pct: 69 },
    { label: 'Canteen', pct: 88 },
    { label: 'Loading Bay', pct: 52 },
    { label: 'Server Room', pct: 12 },
  ],
  Trend: [
    { label: 'Head Office', pct: 74, delta: 4 },
    { label: 'Manufacturing', pct: 65, delta: -3 },
    { label: 'Warehouse', pct: 81, delta: 5 },
    { label: 'Logistics Hub', pct: 57, delta: -3 },
    { label: 'Retail Stores', pct: 68, delta: 3 },
    { label: 'Data Center', pct: 46, delta: 2 },
  ],
};

export const TREND_RANGES = [
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 14 Days', days: 14 },
  { label: 'Last 30 Days', days: 30 },
];

/** Deterministic pseudo random generator so the demo looks the same on every load. */
export function rng(seed: number) {
  let s = seed % 233280 || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** People-on-site and visitor series ending at `end`. */
export function trendSeries(days: number, end: Date, factor: number) {
  const base7 = [5200, 7900, 9900, 7800, 11000, 10200, 12800];
  const r = rng(days * 97 + end.getDate() * 13 + end.getMonth() * 7);
  const labels: string[] = [];
  const people: number[] = [];
  const visitors: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    labels.push(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
    const idx = days - 1 - i;
    const p = days === 7 ? base7[idx] : 6500 + r() * 6500 - (d.getDay() % 6 === 0 ? 3500 : 0);
    people.push(Math.round(p * factor));
    visitors.push(Math.round((300 + r() * 900) * factor));
  }
  return { labels, people, visitors };
}

export type PersonType = 'Employee' | 'Contractor' | 'Visitor' | 'VIP' | 'Alert';

export const PERSON_COLORS: Record<PersonType, string> = {
  Employee: 'var(--ka-8b5cf6)',
  Contractor: 'var(--ka-3b82f6)',
  Visitor: 'var(--ka-22c1a0)',
  VIP: 'var(--ka-f59e0b)',
  Alert: 'var(--ka-ef4444)',
};

export const FLOORS = ['F4', 'F3', 'F2', 'F1', 'G', 'B1'];

const NAMES = [
  'Priya Nair', 'David Chen', 'Sarah Johnson', 'Omar Khalid', 'Li Wei', 'Maria Garcia', 'Arjun Mehta', 'Emma Wilson',
  'Yusuf Rahman', 'Chloe Martin', 'Ravi Shankar', 'Nadia Hussein', 'Tom Baker', 'Aisha Bello', 'Kenji Sato', 'Lucas Silva',
  'Fatima Ali', 'Daniel Kim', 'Hannah Lee', 'Vikram Rao', 'Sofia Rossi', 'Ahmed Saleh', 'Grace Park', 'Ibrahim Musa',
];

export interface MapPerson {
  id: string;
  name: string;
  type: PersonType;
  floor: string;
  x: number;
  y: number;
  time: string;
}

/** Deterministic people on each floor of a site. */
export function sitePeople(site: string, factor: number): MapPerson[] {
  const out: MapPerson[] = [];
  const count = Math.max(8, Math.round(34 * Math.sqrt(factor)));
  FLOORS.forEach((floor, fi) => {
    const r = rng(site.length * 131 + fi * 977 + 7);
    for (let i = 0; i < count; i++) {
      const t = r();
      const type: PersonType = t < 0.55 ? 'Employee' : t < 0.75 ? 'Contractor' : t < 0.92 ? 'Visitor' : 'VIP';
      const mins = Math.floor(r() * 60);
      out.push({
        id: `${floor}-${i}`,
        name: NAMES[Math.floor(r() * NAMES.length)],
        type,
        floor,
        x: 24 + r() * 560,
        y: 22 + r() * 226,
        time: `${9 + Math.floor(r() * 2)}:${String(mins).padStart(2, '0')} AM`,
      });
    }
  });
  // Fixed featured people from the reference design.
  out.push({ id: 'jm', name: 'John Mathew', type: 'Employee', floor: 'F2', x: 300, y: 104, time: '10:24 AM' });
  out.push({ id: 'alert-1', name: 'Unidentified Person', type: 'Alert', floor: 'F2', x: 262, y: 112, time: '10:21 AM' });
  out.push({ id: 'alert-2', name: 'Unidentified Person', type: 'Alert', floor: 'F1', x: 220, y: 150, time: '10:23 AM' });
  out.push({ id: 'alert-3', name: 'Ali Hassan', type: 'Alert', floor: 'B1', x: 420, y: 190, time: '10:16 AM' });
  return out;
}

export interface EventItem {
  id: number;
  title: string;
  person: string;
  initials: string;
  avatar: string;
  location: string;
  time: string;
  category: 'Access' | 'Attendance' | 'Visitor' | 'Safety';
  icon: string;
  color: string;
}

export const EVENTS: EventItem[] = [
  { id: 1, title: 'Access Granted', person: 'John Mathew', initials: 'JM', avatar: 'var(--ka-a16207)', location: 'Main Entrance - Head Office', time: '10:24 AM', category: 'Access', icon: 'fingerprint', color: 'var(--ka-34d399)' },
  { id: 2, title: 'Visitor Check-In', person: 'Ahmed Al Mansoori', initials: 'AM', avatar: 'var(--ka-475569)', location: 'Reception - Head Office', time: '10:22 AM', category: 'Visitor', icon: 'user-check', color: 'var(--ka-3b82f6)' },
  { id: 3, title: 'Restricted Zone Alert', person: 'Unidentified Person', initials: '', avatar: 'var(--ka-cbd5e1)', location: 'Server Room - Floor 1', time: '10:21 AM', category: 'Safety', icon: 'triangle-alert', color: 'var(--ka-ef4444)' },
  { id: 4, title: 'Contractor Entry', person: 'Ramesh Kumar', initials: 'RK', avatar: 'var(--ka-ca8a04)', location: 'Gate 2 - Manufacturing', time: '10:18 AM', category: 'Access', icon: 'hard-hat', color: 'var(--ka-22b8e6)' },
  { id: 5, title: 'Panic Alert (Wearable)', person: 'Ali Hassan', initials: 'AH', avatar: 'var(--ka-9d174d)', location: 'Warehouse - Zone B', time: '10:16 AM', category: 'Safety', icon: 'shield', color: 'var(--ka-ef4444)' },
  { id: 6, title: 'Clock-In', person: 'Priya Nair', initials: 'PN', avatar: 'var(--ka-7c3aed)', location: 'Biometric Kiosk - Head Office', time: '10:12 AM', category: 'Attendance', icon: 'clock', color: 'var(--ka-8b5cf6)' },
  { id: 7, title: 'Visitor Check-Out', person: 'Sarah Johnson', initials: 'SJ', avatar: 'var(--ka-0e7490)', location: 'Reception - Logistics Hub', time: '10:09 AM', category: 'Visitor', icon: 'user-check', color: 'var(--ka-3b82f6)' },
  { id: 8, title: 'Clock-In', person: 'David Chen', initials: 'DC', avatar: 'var(--ka-15803d)', location: 'Gate 1 - Warehouse', time: '10:05 AM', category: 'Attendance', icon: 'clock', color: 'var(--ka-8b5cf6)' },
  { id: 9, title: 'Access Denied', person: 'Tom Baker', initials: 'TB', avatar: 'var(--ka-b45309)', location: 'Lab Door - Manufacturing', time: '09:58 AM', category: 'Access', icon: 'ban', color: 'var(--ka-f97316)' },
  { id: 10, title: 'Late Arrival', person: 'Emma Wilson', initials: 'EW', avatar: 'var(--ka-be185d)', location: 'Turnstile 3 - Head Office', time: '09:46 AM', category: 'Attendance', icon: 'clock', color: 'var(--ka-8b5cf6)' },
];

/** Pool used to simulate new live events. */
export const LIVE_EVENT_POOL: Omit<EventItem, 'id' | 'time'>[] = [
  { title: 'Access Granted', person: 'Maria Garcia', initials: 'MG', avatar: 'var(--ka-0f766e)', location: 'Turnstile 1 - Head Office', category: 'Access', icon: 'fingerprint', color: 'var(--ka-34d399)' },
  { title: 'Clock-In', person: 'Arjun Mehta', initials: 'AM', avatar: 'var(--ka-4338ca)', location: 'Biometric Kiosk - Manufacturing', category: 'Attendance', icon: 'clock', color: 'var(--ka-8b5cf6)' },
  { title: 'Visitor Check-In', person: 'Grace Park', initials: 'GP', avatar: 'var(--ka-9333ea)', location: 'Reception - Head Office', category: 'Visitor', icon: 'user-check', color: 'var(--ka-3b82f6)' },
  { title: 'Contractor Entry', person: 'Ibrahim Musa', initials: 'IM', avatar: 'var(--ka-a16207)', location: 'Gate 2 - Manufacturing', category: 'Access', icon: 'hard-hat', color: 'var(--ka-22b8e6)' },
  { title: 'Tailgating Detected', person: 'Unidentified Person', initials: '', avatar: 'var(--ka-cbd5e1)', location: 'Door 4 - Warehouse', category: 'Safety', icon: 'triangle-alert', color: 'var(--ka-ef4444)' },
];

export const CAMERAS = [
  { name: 'Main Entrance - Head Office', tint: 'var(--kb-8fb3c9)' },
  { name: 'Lobby - Manufacturing', tint: 'var(--kb-b8a58a)' },
  { name: 'Gate 2 - Warehouse', tint: 'var(--kb-9aa6b8)' },
  { name: 'Reception - Logistics Hub', tint: 'var(--kb-a9b9a3)' },
];

export const SYSTEM_HEALTH = [
  { label: 'Access Control', status: 'Online' },
  { label: 'Face Recognition', status: 'Online' },
  { label: 'RTLS Gateways', status: 'Online' },
  { label: 'Integrations', status: 'Online' },
  { label: 'CCTV / VMS', status: 'Online' },
  { label: 'Biometric Kiosks', status: 'Online' },
  { label: 'Visitor Kiosks', status: 'Degraded' },
  { label: 'Edge Gateways', status: 'Online' },
];

export const WIDGETS = [
  { id: 'kpis', label: 'KPI Cards' },
  { id: 'distribution', label: 'People Distribution' },
  { id: 'occupancy', label: 'Site Occupancy' },
  { id: 'trend', label: 'People Trend' },
  { id: 'location', label: 'Live Location & Digital Twin' },
  { id: 'events', label: 'Recent Events' },
  { id: 'camera', label: 'Camera Snapshot' },
  { id: 'emergency', label: 'Emergency Status' },
  { id: 'health', label: 'System Health' },
  { id: 'tasks', label: 'Open Tasks & Approvals' },
] as const;

export type WidgetId = (typeof WIDGETS)[number]['id'];
