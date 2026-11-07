// Shared hard-coded Time & Attendance data (today's record for every employee).
import { rng } from '../dashboards/demo-data';
import { PEOPLE, Person } from '../people/people.data';

/**
 * Status buckets match the reference design:
 * Present Now 7,842 (on-site 7,456 + WFH 386) · Late 326 · Absent 752 (unplanned 332 + On Leave 420).
 */
export type AttStatus = 'Present' | 'WFH' | 'Late' | 'On Leave' | 'Absent';
export const STATUS_COLOR: Record<AttStatus, string> = { Present: '#22c55e', Late: '#f59e0b', Absent: '#ef4444', 'On Leave': '#8b5cf6', WFH: '#3b82f6' };
export const SHIFTS = [
  { name: 'General', start: '09:00', end: '18:00' },
  { name: 'Morning', start: '07:00', end: '16:00' },
  { name: 'Evening', start: '14:00', end: '23:00' },
  { name: 'Night', start: '22:00', end: '07:00' },
];
export const METHODS = ['Face', 'Card', 'Mobile', 'Fingerprint'];
export const GATES: Record<string, string[]> = {
  'Head Office': ['Main Entrance', 'Reception', 'Lobby Turnstile 2'],
  Manufacturing: ['Gate 2', 'Gate 1', 'Plant Entrance'],
  Warehouse: ['Warehouse - Zone B', 'Gate 1', 'Loading Bay'],
  'Regional Office': ['Main Entrance', 'Reception'],
  'Tech Center': ['Main Entrance', 'Lab Entrance'],
  'Data Center': ['Security Gate'],
  'Logistics Hub': ['Gate', 'Dispatch'],
  'Retail Stores': ['Staff Entrance'],
};

export interface AttRecord {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  dept: string;
  site: string;
  empType: string;
  designation: string;
  shift: string;
  shiftStart: string;
  status: AttStatus;
  checkIn: string;
  checkOut: string;
  lateBy: number;
  method: string;
  location: string;
  worked: number;
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min) % 60).padStart(2, '0')}`;
export const ampm = (t: string) => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const EMPLOYEES: Person[] = PEOPLE.filter((p) => p.type === 'Employee');

export const RECORDS: AttRecord[] = (() => {
  const r = rng(2468);
  // Deterministic shuffle of indexes, then assign exact bucket sizes.
  const idx = EMPLOYEES.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const buckets: [AttStatus, number][] = [['Late', 326], ['WFH', 386], ['On Leave', 420], ['Absent', 332]];
  const status: AttStatus[] = Array(EMPLOYEES.length).fill('Present');
  let k = 0;
  for (const [s, n] of buckets) for (let c = 0; c < n; c++) status[idx[k++]] = s;
  // Featured people from the designs are present / checked in.
  ['EMP-00123', 'EMP-00124', 'EMP-00125', 'EMP-00126', 'EMP-00127', 'EMP-00129'].forEach((id) => {
    const i = EMPLOYEES.findIndex((p) => p.id === id);
    if (i >= 0 && status[i] !== 'Present') {
      const swap = status.findIndex((s, j) => s === 'Present' && !['EMP-00123', 'EMP-00124', 'EMP-00125', 'EMP-00126', 'EMP-00127', 'EMP-00129'].includes(EMPLOYEES[j].id));
      status[swap] = status[i];
      status[i] = 'Present';
    }
  });

  return EMPLOYEES.map((p, i) => {
    const sh = p.dept === 'Operations' || p.dept === 'Logistics' ? SHIFTS[Math.floor(r() * 3) + (r() < 0.5 ? 0 : 1)] ?? SHIFTS[0] : SHIFTS[r() < 0.85 ? 0 : 1];
    const st = status[i];
    const start = toMin(sh.start);
    let inMin = 0;
    let lateBy = 0;
    if (st === 'Present' || st === 'WFH') inMin = start - 45 + Math.floor(r() * 50);
    if (st === 'Late') {
      lateBy = 6 + Math.floor(r() * r() * 80);
      inMin = start + lateBy;
    }
    const checkIn = inMin ? hhmm(inMin) : '';
    const gate = (GATES[p.site] ?? ['Main Entrance'])[Math.floor(r() * (GATES[p.site]?.length ?? 1))];
    return {
      id: p.id, name: p.name, initials: p.initials, avatar: p.avatar, dept: p.dept, site: p.site, empType: p.empType, designation: p.designation,
      shift: sh.name, shiftStart: sh.start, status: st, checkIn,
      checkOut: sh.name === 'Night' && checkIn ? hhmm(toMin(sh.end) + Math.floor(r() * 20)) : '',
      lateBy,
      method: st === 'WFH' ? 'Mobile' : METHODS[Math.floor(r() * (r() < 0.6 ? 1 : 4))],
      location: st === 'WFH' ? 'Remote (VPN)' : checkIn ? `${gate} - ${p.site}` : '—',
      worked: 0,
    };
  });
})();

/** Department and site aggregates. */
export function aggregate(rows: AttRecord[], key: 'dept' | 'site') {
  const m = new Map<string, { name: string; total: number; present: number; late: number; absent: number }>();
  for (const r of rows) {
    const g = m.get(r[key]) ?? { name: r[key], total: 0, present: 0, late: 0, absent: 0 };
    g.total++;
    if (r.status === 'Present' || r.status === 'WFH') g.present++;
    else if (r.status === 'Late') g.late++;
    else g.absent++;
    m.set(r[key], g);
  }
  return [...m.values()].map((g) => ({ ...g, pct: Math.round(((g.present + g.late) / g.total) * 1000) / 10 })).sort((a, b) => b.total - a.total);
}

export const toMinutes = toMin;
