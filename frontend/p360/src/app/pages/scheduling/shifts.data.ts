// Shared hard-coded data for Shift & Workforce Scheduling.
import { rng } from '../dashboards/demo-data';
import { RECORDS } from '../attendance/attendance.data';

export interface Brk {
  name: string;
  start: string;
  end: string;
  paid: boolean;
}
export interface Shift {
  id: number;
  name: string;
  code: string;
  type: string;
  pattern: string;
  start: string;
  end: string;
  start2?: string;
  end2?: string;
  hours: number;
  grace: number;
  status: 'Active' | 'Inactive' | 'Draft';
  color: string;
  icon: string;
  sites: string;
  depts: string;
  empTypes: string;
  from: string;
  to: string;
  description: string;
  breaks: Brk[];
  assigned: number;
  site: string;
}

const B_STD: Brk[] = [
  { name: 'Tea Break', start: '10:30', end: '10:45', paid: true },
  { name: 'Lunch Break', start: '13:00', end: '13:30', paid: false },
  { name: 'Tea Break', start: '15:30', end: '15:45', paid: true },
];
const shiftBreaks = (start: string): Brk[] => {
  const h = +start.split(':')[0];
  const at = (o: number, m = 0) => `${String((h + o) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return [
    { name: 'Tea Break', start: at(2, 30), end: at(2, 45), paid: true },
    { name: 'Meal Break', start: at(4), end: at(4, 30), paid: false },
    { name: 'Tea Break', start: at(6), end: at(6, 15), paid: true },
  ];
};

type Row = [string, string, string, string, string, string, number, number, Shift['status'], string, string, number, string?, string?];
// name, code, type, pattern, start, end, hours, grace, status, color, site, assigned, start2/end2 for split
const ROWS: Row[] = [
  ['Day Shift', 'DS-01', 'General', 'Fixed', '08:00', '16:00', 8, 15, 'Active', 'var(--ka-7c3aed)', 'All Sites', 2140],
  ['Morning Shift', 'MS-01', 'General', 'Fixed', '06:00', '14:00', 8, 15, 'Active', 'var(--ka-4f46e5)', 'All Sites', 1260],
  ['Evening Shift', 'ES-01', 'General', 'Fixed', '14:00', '22:00', 8, 15, 'Active', 'var(--ka-2563eb)', 'All Sites', 980],
  ['Night Shift', 'NS-01', 'General', 'Fixed', '22:00', '06:00', 8, 15, 'Active', 'var(--ka-1e40af)', 'All Sites', 640],
  ['Split Shift', 'SS-01', 'General', 'Split', '08:00', '12:00', 8, 15, 'Active', 'var(--ka-9333ea)', 'Retail Stores', 120, '16:00', '20:00'],
  ['Rotating Shift A', 'RS-A', 'Rotational', 'Rotation', '06:00', '14:00', 8, 15, 'Active', 'var(--ka-0284c7)', 'Manufacturing', 410],
  ['Rotating Shift B', 'RS-B', 'Rotational', 'Rotation', '14:00', '22:00', 8, 15, 'Active', 'var(--ka-0369a1)', 'Manufacturing', 405],
  ['Rotating Shift C', 'RS-C', 'Rotational', 'Rotation', '22:00', '06:00', 8, 15, 'Active', 'var(--ka-075985)', 'Manufacturing', 398],
  ['Weekend Shift', 'WS-01', 'General', 'Fixed', '10:00', '18:00', 8, 15, 'Active', 'var(--ka-0d9488)', 'Retail Stores', 96],
  ['On Call', 'OC-01', 'On Call', 'Flexible', '', '', 0, 0, 'Active', 'var(--ka-dc2626)', 'All Sites', 58],
  ['Remote Shift', 'RM-01', 'Remote', 'Fixed', '09:00', '17:00', 8, 15, 'Active', 'var(--ka-2563eb)', 'All Sites', 386],
  ['Part Time - Morning', 'PT-M', 'Part Time', 'Fixed', '09:00', '13:00', 4, 10, 'Active', 'var(--ka-3730a3)', 'All Sites', 142],
  ['Part Time - Evening', 'PT-E', 'Part Time', 'Fixed', '17:00', '21:00', 4, 10, 'Active', 'var(--ka-4338ca)', 'Retail Stores', 108],
  ['General Office', 'GO-01', 'General', 'Fixed', '09:00', '18:00', 9, 10, 'Active', 'var(--ka-6d28d9)', 'Head Office', 1830],
  ['Warehouse Early', 'WH-E', 'General', 'Fixed', '05:00', '13:00', 8, 10, 'Active', 'var(--ka-ea580c)', 'Warehouse', 520],
  ['Warehouse Late', 'WH-L', 'General', 'Fixed', '13:00', '21:00', 8, 10, 'Active', 'var(--ka-c2410c)', 'Warehouse', 488],
  ['Plant 12h Day', 'P12-D', 'Rotational', 'Rotation', '07:00', '19:00', 12, 10, 'Active', 'var(--ka-16a34a)', 'Manufacturing', 360],
  ['Plant 12h Night', 'P12-N', 'Rotational', 'Rotation', '19:00', '07:00', 12, 10, 'Active', 'var(--ka-15803d)', 'Manufacturing', 344],
  ['Security Day', 'SEC-D', 'Rotational', 'Rotation', '07:00', '19:00', 12, 5, 'Active', 'var(--ka-475569)', 'All Sites', 96],
  ['Security Night', 'SEC-N', 'Rotational', 'Rotation', '19:00', '07:00', 12, 5, 'Active', 'var(--ka-334155)', 'All Sites', 92],
  ['Retail Opening', 'RT-O', 'General', 'Fixed', '09:00', '17:00', 8, 10, 'Active', 'var(--ka-db2777)', 'Retail Stores', 210],
  ['Retail Closing', 'RT-C', 'General', 'Fixed', '14:00', '22:00', 8, 10, 'Active', 'var(--ka-be185d)', 'Retail Stores', 198],
  ['Data Center A', 'DC-A', 'Rotational', 'Rotation', '06:00', '18:00', 12, 5, 'Active', 'var(--ka-0891b2)', 'Data Center', 64],
  ['Data Center B', 'DC-B', 'Rotational', 'Rotation', '18:00', '06:00', 12, 5, 'Active', 'var(--ka-155e75)', 'Data Center', 60],
  ['Ramadan Shift', 'RMD-01', 'General', 'Fixed', '09:00', '15:00', 6, 15, 'Inactive', 'var(--ka-a16207)', 'All Sites', 0],
  ['Flexi Hours', 'FX-01', 'Flexible', 'Flexible', '07:00', '19:00', 8, 0, 'Draft', 'var(--ka-65a30d)', 'Head Office', 0],
  ['Training Day', 'TR-01', 'General', 'Fixed', '09:00', '17:00', 8, 0, 'Inactive', 'var(--ka-64748b)', 'Tech Center', 0],
  ['Holiday Cover', 'HC-01', 'On Call', 'Flexible', '08:00', '20:00', 12, 15, 'Draft', 'var(--ka-b91c1c)', 'All Sites', 0],
];

export const SHIFTS: Shift[] = ROWS.map(([name, code, type, pattern, start, end, hours, grace, status, color, site, assigned, start2, end2], i) => ({
  id: i + 1, name, code, type, pattern, start, end, start2, end2, hours, grace, status, color, icon: 'clock',
  sites: site, site, depts: 'All Departments', empTypes: type === 'Part Time' ? 'Part Time' : 'Employee, Contractor',
  from: '2026-01-01', to: '', assigned,
  description: name === 'Day Shift' ? 'Standard day shift for office employees.' : `${name} (${start || 'flexible'}${end ? '–' + end : ''}) for ${site === 'All Sites' ? 'all sites' : site}.`,
  breaks: name === 'Day Shift' ? B_STD.map((b) => ({ ...b })) : hours >= 4 && start ? shiftBreaks(start).slice(0, hours >= 8 ? 3 : 1) : [],
}));

/** Codes used inside rosters (shift codes plus OFF and LV). */
export const OFF = 'OFF';
export const LEAVE = 'LV';
export const codeColor = (code: string) => (code === OFF ? 'var(--ka-e5e7eb)' : code === LEAVE ? 'var(--ka-ddd6fe)' : SHIFTS.find((s) => s.code === code)?.color ?? 'var(--ka-9ca3af)');
export const codeHours = (code: string) => SHIFTS.find((s) => s.code === code)?.hours ?? 0;
export const codeStart = (code: string) => SHIFTS.find((s) => s.code === code)?.start ?? '';
export const codeEnd = (code: string) => SHIFTS.find((s) => s.code === code)?.end ?? '';
export const isNight = (code: string) => {
  const s = codeStart(code);
  return !!s && (+s.split(':')[0] >= 18 || +s.split(':')[0] < 4);
};

/* ---------- Rotation templates ---------- */
export interface Template {
  id: number;
  name: string;
  code: string;
  desc: string;
  cycle: string[];
  teams: number;
  people: number;
  status: 'Active' | 'Draft';
}
export const TEMPLATES: Template[] = [
  { id: 1, name: '5x2 Office Week', code: 'T-5X2', desc: 'Mon–Fri day shift, weekends off', cycle: ['DS-01', 'DS-01', 'DS-01', 'DS-01', 'DS-01', OFF, OFF], teams: 18, people: 3920, status: 'Active' },
  { id: 2, name: '3-Shift Weekly Rotation', code: 'T-ABC', desc: 'A→B→C weekly rotation, 5 on 2 off', cycle: ['RS-A', 'RS-A', 'RS-A', 'RS-A', 'RS-A', OFF, OFF, 'RS-B', 'RS-B', 'RS-B', 'RS-B', 'RS-B', OFF, OFF, 'RS-C', 'RS-C', 'RS-C', 'RS-C', 'RS-C', OFF, OFF], teams: 6, people: 1213, status: 'Active' },
  { id: 3, name: '4-on 4-off (12h)', code: 'T-4X4', desc: '4 day 12h shifts, 4 off, then nights', cycle: ['P12-D', 'P12-D', 'P12-D', 'P12-D', OFF, OFF, OFF, OFF, 'P12-N', 'P12-N', 'P12-N', 'P12-N', OFF, OFF, OFF, OFF], teams: 4, people: 704, status: 'Active' },
  { id: 4, name: 'Continental 2-2-3', code: 'T-223', desc: '2 on, 2 off, 3 on, alternating weeks', cycle: ['SEC-D', 'SEC-D', OFF, OFF, 'SEC-D', 'SEC-D', 'SEC-D', OFF, OFF, 'SEC-N', 'SEC-N', OFF, OFF, OFF], teams: 3, people: 188, status: 'Active' },
  { id: 5, name: 'DuPont 12h', code: 'T-DUP', desc: '4-week cycle of 12h day and night blocks', cycle: ['DC-B', 'DC-B', 'DC-B', 'DC-B', OFF, OFF, OFF, 'DC-A', 'DC-A', 'DC-A', OFF, 'DC-B', 'DC-B', 'DC-B', OFF, OFF, OFF, 'DC-A', 'DC-A', 'DC-A', 'DC-A', OFF, OFF, OFF, OFF, OFF, OFF, OFF], teams: 2, people: 124, status: 'Active' },
  { id: 6, name: 'Warehouse Early/Late', code: 'T-WEL', desc: 'Alternate early and late weeks', cycle: ['WH-E', 'WH-E', 'WH-E', 'WH-E', 'WH-E', 'WH-E', OFF, 'WH-L', 'WH-L', 'WH-L', 'WH-L', 'WH-L', OFF, OFF], teams: 5, people: 1008, status: 'Active' },
  { id: 7, name: 'Retail 6x1', code: 'T-6X1', desc: 'Six days with rotating day off', cycle: ['RT-O', 'RT-O', 'RT-C', 'RT-C', 'RT-O', 'RT-C', OFF], teams: 12, people: 408, status: 'Active' },
  { id: 8, name: 'Early / Late / Night', code: 'T-ELN', desc: 'Morning, evening, night weeks', cycle: ['MS-01', 'MS-01', 'MS-01', 'MS-01', 'MS-01', OFF, OFF, 'ES-01', 'ES-01', 'ES-01', 'ES-01', 'ES-01', OFF, OFF, 'NS-01', 'NS-01', 'NS-01', 'NS-01', 'NS-01', OFF, OFF], teams: 7, people: 1620, status: 'Active' },
  { id: 9, name: 'Weekend Only', code: 'T-WKD', desc: 'Saturday and Sunday shifts', cycle: [OFF, OFF, OFF, OFF, OFF, 'WS-01', 'WS-01'], teams: 4, people: 96, status: 'Active' },
  { id: 10, name: 'Part-time 3 Days', code: 'T-PT3', desc: 'Mon, Wed, Fri mornings', cycle: ['PT-M', OFF, 'PT-M', OFF, 'PT-M', OFF, OFF], teams: 6, people: 142, status: 'Active' },
  { id: 11, name: 'Field Sales Flex', code: 'T-FLX', desc: 'Remote Mon/Fri, office Tue–Thu', cycle: ['RM-01', 'GO-01', 'GO-01', 'GO-01', 'RM-01', OFF, OFF], teams: 3, people: 210, status: 'Active' },
  { id: 12, name: 'Ramadan Short Days', code: 'T-RMD', desc: '6-hour days during Ramadan', cycle: ['RMD-01', 'RMD-01', 'RMD-01', 'RMD-01', 'RMD-01', OFF, OFF], teams: 0, people: 0, status: 'Draft' },
];

/* ---------- Teams and generated rosters ---------- */
export interface Team {
  id: string;
  name: string;
  dept: string;
  site: string;
  template: number;
  /** Minimum people needed per shift code each day. */
  required: Record<string, number>;
}
export const TEAMS: Team[] = [
  { id: 'ops-mf', name: 'Operations · Manufacturing', dept: 'Operations', site: 'Manufacturing', template: 2, required: { 'RS-A': 5, 'RS-B': 5, 'RS-C': 4 } },
  { id: 'log-wh', name: 'Logistics · Warehouse', dept: 'Logistics', site: 'Warehouse', template: 6, required: { 'WH-E': 7, 'WH-L': 6 } },
  { id: 'it-ho', name: 'IT · Head Office', dept: 'IT', site: 'Head Office', template: 1, required: { 'DS-01': 14 } },
  { id: 'fm-ho', name: 'Facility Maintenance · Head Office', dept: 'Facility Maintenance', site: 'Head Office', template: 8, required: { 'MS-01': 4, 'ES-01': 4, 'NS-01': 3 } },
  { id: 'sales-rt', name: 'Sales · Retail Stores', dept: 'Sales', site: 'Retail Stores', template: 7, required: { 'RT-O': 5, 'RT-C': 5 } },
  { id: 'sup-dc', name: 'Support · Data Center', dept: 'Support', site: 'Data Center', template: 5, required: { 'DC-A': 2, 'DC-B': 2 } },
];

export interface RosterRow {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  days: string[];
}

/** Members of a team (falls back to department-wide employees when a site has few). */
export function teamMembers(team: Team, n = 20) {
  const exact = RECORDS.filter((r) => r.dept === team.dept && r.site === team.site);
  const more = RECORDS.filter((r) => r.dept === team.dept && r.site !== team.site);
  return [...exact, ...more].slice(0, n);
}

/** Generates a week roster for a team from its rotation template. `week` is 0 for current week. */
export function rosterFor(team: Team, week: number, n = 20): RosterRow[] {
  const tpl = TEMPLATES.find((t) => t.id === team.template)!;
  const r = rng(team.id.length * 101 + week * 17 + 3);
  return teamMembers(team, n).map((e, i) => {
    const offset = (i * 3 + week * 7) % tpl.cycle.length;
    const days = Array.from({ length: 7 }, (_, d) => {
      if (r() < 0.035) return LEAVE;
      return tpl.cycle[(offset + d) % tpl.cycle.length];
    });
    return { id: e.id, name: e.name, initials: e.initials, avatar: e.avatar, days };
  });
}

/** Monday of the week containing `d`, shifted by `week` weeks. */
export function weekStart(d: Date, week = 0) {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow + week * 7);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function weekDays(start: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { label: d.toLocaleDateString('en-GB', { weekday: 'short' }), date: d.getDate(), iso: d.toISOString().slice(0, 10), weekend: d.getDay() === 0 || d.getDay() === 6 };
  });
}

/** Rest between a shift on one day and the next day's shift is under 11 hours. */
export function restViolation(prev: string, next: string) {
  const s1 = codeStart(prev);
  const e1 = codeEnd(prev);
  const s2 = codeStart(next);
  if (!s1 || !e1 || !s2) return false;
  const toM = (t: string) => +t.split(':')[0] * 60 + +t.split(':')[1];
  let end = toM(e1);
  if (end <= toM(s1)) end += 1440; // overnight shift ends next morning
  return 1440 + toM(s2) - end < 11 * 60;
}
