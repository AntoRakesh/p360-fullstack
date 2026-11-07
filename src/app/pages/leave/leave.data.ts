// Shared hard-coded data for Leave & Absence Management.
import { rng } from '../dashboards/demo-data';
import { RECORDS } from '../attendance/attendance.data';

export interface LeaveType {
  id: number;
  name: string;
  code: string;
  category: 'Earned' | 'Medical' | 'Special' | 'Unpaid' | 'Custom';
  days: number;
  per: string;
  carry: boolean;
  carryMax: number;
  encash: boolean | null;
  applicable: string;
  status: 'Active' | 'Inactive';
  paid: boolean;
  group: string;
  icon: string;
  color: string;
  description: string;
  unit: string;
  waiting: string;
  maxContinuous: number;
  notice: number;
  utilization: number;
  used: number[];
}

type Row = [string, string, LeaveType['category'], number, string, number, boolean | null, string, boolean, string, string, string];
// name, code, category, days, per, carryMax(-1 = no), encash, applicable, paid, group, icon, color
const ROWS: Row[] = [
  ['Annual Leave', 'AL', 'Earned', 30, 'year', 15, true, 'Employees', true, 'Standard', 'tree', '#16a34a'],
  ['Sick Leave', 'SL', 'Medical', 14, 'year', 7, false, 'Employees', true, 'Standard', 'shield-plus', '#dc2626'],
  ['Casual Leave', 'CL', 'Earned', 10, 'year', 5, true, 'Employees', true, 'Standard', 'calendar-days', '#2563eb'],
  ['Maternity Leave', 'ML', 'Special', 90, 'once', -1, false, 'Female Employees', true, 'Statutory', 'user', '#db2777'],
  ['Paternity Leave', 'PL', 'Special', 5, 'once', -1, false, 'Male Employees', true, 'Statutory', 'user', '#3b82f6'],
  ['Compassionate Leave', 'CP', 'Special', 5, 'event', -1, false, 'Employees', true, 'Statutory', 'heart', '#e11d48'],
  ['Marriage Leave', 'MR', 'Special', 5, 'once', -1, false, 'Employees', true, 'Company', 'star', '#f97316'],
  ['Hajj Leave', 'HJ', 'Special', 10, 'once', -1, false, 'Employees (Muslim)', true, 'Statutory', 'building', '#4f46e5'],
  ['Unpaid Leave', 'UL', 'Unpaid', 0, 'request', -1, null, 'Employees', false, 'Company', 'file-text', '#64748b'],
  ['Study Leave', 'ST', 'Special', 10, 'year', -1, false, 'Employees', true, 'Company', 'graduation-cap', '#9333ea'],
  ['Bereavement Leave', 'BR', 'Special', 5, 'event', -1, false, 'Employees', true, 'Statutory', 'user', '#7c3aed'],
  ['Other Leave', 'OT', 'Custom', 0, 'configurable', -1, null, 'Employees', true, 'Company', 'more', '#6b7280'],
];
const UTIL = [62.4, 48.1, 55.3, 71.2, 64.8, 22.5, 18.4, 9.6, 6.1, 31.7, 12.3, 4.2];

export const LEAVE_TYPES: LeaveType[] = ROWS.map(([name, code, category, days, per, carryMax, encash, applicable, paid, group, icon, color], i) => {
  const r = rng(i * 53 + 7);
  return {
    id: i + 1, name, code, category, days, per, carry: carryMax > 0, carryMax: Math.max(0, carryMax), encash, applicable, status: 'Active', paid, group, icon, color,
    description: name === 'Annual Leave' ? 'General leave for rest and recreation' : `${name} as per company and labour-law policy.`,
    unit: code === 'AL' || code === 'CL' ? 'Full Day / Half Day / Hour' : 'Full Day',
    waiting: code === 'AL' ? 'None' : code === 'ML' || code === 'HJ' ? '12 months service' : 'None',
    maxContinuous: code === 'AL' ? 15 : days || 30,
    notice: code === 'AL' ? 3 : code === 'CL' ? 1 : 0,
    utilization: UTIL[i],
    used: Array.from({ length: 6 }, () => Math.round((20 + r() * 110) * (UTIL[i] / 60))),
  };
});
export const typeByCode = (c: string) => LEAVE_TYPES.find((t) => t.code === c)!;

/* ---------- Holidays (UAE 2026) ---------- */
export interface Holiday {
  id: number;
  date: string;
  name: string;
  type: 'Public' | 'Religious' | 'Company';
  calendar: string;
}
export const HOLIDAYS: Holiday[] = [
  ['2026-01-01', "New Year's Day", 'Public'], ['2026-03-19', 'Eid al-Fitr (Day 1)', 'Religious'], ['2026-03-20', 'Eid al-Fitr (Day 2)', 'Religious'],
  ['2026-03-21', 'Eid al-Fitr (Day 3)', 'Religious'], ['2026-05-26', 'Arafat Day', 'Religious'], ['2026-05-27', 'Eid al-Adha (Day 1)', 'Religious'],
  ['2026-05-28', 'Eid al-Adha (Day 2)', 'Religious'], ['2026-06-16', 'Islamic New Year', 'Religious'], ['2026-08-25', "Prophet's Birthday", 'Religious'],
  ['2026-12-01', 'Commemoration Day', 'Public'], ['2026-12-02', 'National Day', 'Public'], ['2026-12-03', 'National Day Holiday', 'Public'],
  ['2026-12-24', 'Company Year-end Day', 'Company'],
].map(([date, name, type], i) => ({ id: i + 1, date, name, type: type as Holiday['type'], calendar: 'UAE' }));
export const isHoliday = (iso: string) => HOLIDAYS.some((h) => h.date === iso);

/** Working days between two ISO dates (Sat/Sun and holidays excluded). */
export function workingDays(from: string, to: string) {
  if (!from || !to || to < from) return 0;
  let n = 0;
  const d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getDay() !== 0 && d.getDay() !== 6 && !isHoliday(iso)) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

/* ---------- Balances ---------- */
export interface Balance {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  dept: string;
  site: string;
  al: number;
  alUsed: number;
  sl: number;
  slUsed: number;
  cl: number;
  clUsed: number;
  carry: number;
  alLeft: number;
  slLeft: number;
  clLeft: number;
}
export const BALANCES: Balance[] = (() => {
  const r = rng(707);
  return RECORDS.map((x) => {
    const carry = Math.floor(r() * 16);
    const alUsed = Math.round(r() * 34 * 2) / 2;
    const slUsed = Math.floor(r() * r() * 14);
    const clUsed = Math.floor(r() * 10);
    return {
      id: x.id, name: x.name, initials: x.initials, avatar: x.avatar, dept: x.dept, site: x.site,
      al: 30 + carry, alUsed, sl: 14, slUsed, cl: 10, clUsed, carry,
      alLeft: Math.round((30 + carry - alUsed) * 2) / 2, slLeft: 14 - slUsed, clLeft: 10 - clUsed,
    };
  });
})();

/* ---------- Applications ---------- */
export interface LeaveApp {
  id: string;
  empId: string;
  name: string;
  initials: string;
  avatar: string;
  dept: string;
  type: string;
  from: string;
  to: string;
  days: number;
  reason: string;
  applied: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  approver: string;
  step: number;
}
const iso = (off: number) => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);
const REASONS: Record<string, string[]> = {
  AL: ['Family vacation', 'Travel to home country', 'Personal time off', 'Visiting relatives'],
  SL: ['Flu and fever', 'Medical procedure', 'Back pain', 'Doctor advised rest'],
  CL: ['Personal errand', 'Child school event', 'Home repairs'],
  ML: ['Maternity'], PL: ['Birth of child'], CP: ['Family emergency'], MR: ['Own wedding'], ST: ['Final exams'], BR: ['Loss of family member'], UL: ['Extended personal travel'],
};
export const APPLICATIONS: LeaveApp[] = (() => {
  const r = rng(4242);
  const codes = ['AL', 'AL', 'AL', 'SL', 'SL', 'CL', 'CL', 'ML', 'PL', 'CP', 'MR', 'ST', 'BR', 'UL'];
  return Array.from({ length: 220 }, (_, i) => {
    const x = RECORDS[(i * 37) % RECORDS.length];
    const type = codes[Math.floor(r() * codes.length)];
    const start = Math.floor(r() * 60) - 20;
    const len = type === 'ML' ? 90 : type === 'AL' ? 1 + Math.floor(r() * 12) : 1 + Math.floor(r() * 3);
    const from = iso(start);
    const to = iso(start + len - 1);
    const st: LeaveApp['status'] = i < 28 ? 'Pending' : r() < 0.82 ? 'Approved' : r() < 0.6 ? 'Rejected' : 'Cancelled';
    return {
      id: `LV-${String(26000 + i)}`, empId: x.id, name: x.name, initials: x.initials, avatar: x.avatar, dept: x.dept, type, from, to,
      days: type === 'ML' ? 90 : workingDays(from, to) || 1, reason: REASONS[type][Math.floor(r() * REASONS[type].length)],
      applied: iso(start - 3 - Math.floor(r() * 10)), status: st, approver: st === 'Pending' ? 'Line Manager' : ['Priya Sharma', 'Omar Khalid', 'Ravi Shankar'][i % 3], step: 1,
    };
  });
})();
