// AI & People Intelligence — one shared dataset + root store (copilot conversations, anomalies,
// recommendations, saved reports). Every page in pages/ai/ reads from here so numbers stay consistent.
import { Injectable, computed, signal } from '@angular/core';
import { Series } from '@p360/shared/ui';

/* ------------------------------------------------------------------ helpers */
const PALETTE = ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0891b2)', 'var(--ka-16a34a)', 'var(--ka-ea580c)', 'var(--ka-db2777)', 'var(--ka-9333ea)', 'var(--ka-0d9488)', 'var(--ka-ca8a04)', 'var(--ka-dc2626)'];
export const colorOf = (s: string) => PALETTE[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
export const initialsOf = (s: string) => s.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
export const pct = (a: number, b: number, d = 1) => +((a / (b || 1)) * 100).toFixed(d);
export const dayLabel = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const shortDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};
export const nowTime = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

/* ------------------------------------------------------------------ workforce */
export const TOTAL_EMPLOYEES = 1248;
export const ATTENDANCE = { present: 1082, late: 76, absent: 60, leave: 30 };

export interface Dept {
  name: string;
  headcount: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  overtime: number; // hours this week
  engagement: number;
  highRisk: number; // employees with attrition risk >= 60
}
/** Company-wide departments (sum = 1,248 / 1,082 / 76 / 60 / 30). */
export const DEPTS: Dept[] = [
  { name: 'Operations', headcount: 383, present: 330, late: 28, absent: 17, leave: 8, overtime: 2140, engagement: 71, highRisk: 8 },
  { name: 'Logistics', headcount: 236, present: 200, late: 18, absent: 12, leave: 6, overtime: 1260, engagement: 74, highRisk: 4 },
  { name: 'Maintenance', headcount: 96, present: 84, late: 6, absent: 4, leave: 2, overtime: 520, engagement: 76, highRisk: 2 },
  { name: 'Facilities', headcount: 64, present: 55, late: 4, absent: 3, leave: 2, overtime: 210, engagement: 79, highRisk: 1 },
  { name: 'Safety', headcount: 48, present: 43, late: 2, absent: 2, leave: 1, overtime: 160, engagement: 82, highRisk: 1 },
  { name: 'Administration', headcount: 120, present: 108, late: 4, absent: 6, leave: 2, overtime: 140, engagement: 80, highRisk: 1 },
  { name: 'IT', headcount: 98, present: 92, late: 3, absent: 2, leave: 1, overtime: 310, engagement: 81, highRisk: 2 },
  { name: 'Finance', headcount: 85, present: 76, late: 4, absent: 4, leave: 1, overtime: 120, engagement: 83, highRisk: 1 },
  { name: 'Sales', headcount: 76, present: 62, late: 6, absent: 6, leave: 2, overtime: 180, engagement: 68, highRisk: 2 },
  { name: 'HR', headcount: 42, present: 32, late: 1, absent: 4, leave: 5, overtime: 40, engagement: 84, highRisk: 1 },
];
export const TOTAL_OVERTIME = DEPTS.reduce((a, d) => a + d.overtime, 0); // 5,080 h

/** Head Office attendance by department (as in the copilot answer). */
export const HO_DEPTS = [
  { name: 'Operations', total: 245, present: 230, absent: 10, late: 5 },
  { name: 'Administration', total: 120, present: 112, absent: 6, late: 2 },
  { name: 'IT', total: 98, present: 95, absent: 2, late: 1 },
  { name: 'Finance', total: 85, present: 80, absent: 4, late: 1 },
  { name: 'HR', total: 42, present: 40, absent: 1, late: 1 },
  { name: 'Sales', total: 76, present: 68, absent: 6, late: 2 },
];

export const LOCATIONS = [
  { name: 'Head Office', count: 428, color: 'var(--ka-2563eb)' },
  { name: 'Warehouse', count: 312, color: 'var(--ka-3b82f6)' },
  { name: 'Remote', count: 248, color: 'var(--ka-3b82f6)' },
  { name: 'Site A', count: 156, color: 'var(--ka-60a5fa)' },
  { name: 'Site B', count: 98, color: 'var(--ka-93c5fd)' },
];
export const ON_SITE_NOW = LOCATIONS.reduce((a, l) => a + l.count, 0); // 1,242

/** Weekly trend helpers (last 12 weeks / months). */
export const WEEKS = ['W31', 'W32', 'W33', 'W34', 'W35', 'W36', 'W37', 'W38', 'W39', 'W40', 'W41', 'W42'];
export const MONTHS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
export const ABSENTEEISM = [3.9, 4.1, 3.8, 4.0, 4.2, 3.7, 3.9, 4.0, 4.3, 4.1, 4.6, 4.8]; // % of workforce
export const ATTENDANCE_RATE = [88.9, 88.4, 89.1, 88.7, 88.2, 89.4, 89.0, 88.6, 87.9, 88.1, 87.3, 86.7];
export const HEADCOUNT_TREND = [1176, 1181, 1190, 1196, 1203, 1209, 1214, 1221, 1228, 1233, 1240, 1248];
export const CONTRACTOR_TREND = [268, 271, 270, 276, 282, 288, 290, 296, 301, 306, 312, 349]; // +12% this month
export const OVERTIME_TREND = [3920, 4010, 3880, 4150, 4230, 4060, 4310, 4420, 4380, 4560, 4710, 5080];
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Overtime intensity (% of capacity) by department x day. */
export const OT_HEAT: number[][] = DEPTS.map((d, i) => DAYS.map((_, j) => Math.round(Math.min(98, (d.overtime / d.headcount) * 9 + ((i * 7 + j * 13) % 22) + (j >= 5 ? -12 : 0)))));

/* ------------------------------------------------------------------ employees */
export interface Employee {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  dept: string;
  site: string;
  role: string;
  overtime: number; // hours this week
  late: number; // late arrivals this month
  absences: number; // last 90 days
  risk: number; // attrition risk %
  drivers: string;
  engagement: number;
  tenure: number;
  cert?: { name: string; days: number };
  status: 'Present' | 'Late' | 'Absent' | 'On Leave' | 'Remote';
}
const NAMED: [string, string, string, string, string?, number?][] = [
  ['Ahmed Hassan', 'Operations', 'Head Office', 'Shift Supervisor', 'First Aid', 4],
  ['Priya Sharma', 'Safety', 'Warehouse', 'HSE Officer', 'Fire Safety', 6],
  ['Ramesh Kumar', 'Maintenance', 'Site A', 'Technician', 'Work at Height', 8],
  ['Maria Santos', 'Facilities', 'Head Office', 'Facility Coordinator', 'Forklift', 10],
  ['Ali Khan', 'IT', 'Head Office', 'Systems Engineer', 'Cyber Security', 12],
  ['Fatima Noor', 'Logistics', 'Warehouse', 'Forklift Operator', 'Forklift', 17],
  ['John Mathew', 'Operations', 'Site B', 'Line Operator', 'First Aid', 22],
  ['Sara Ali', 'HR', 'Head Office', 'HR Business Partner', 'Data Privacy', 27],
  ['Omar Farouk', 'Operations', 'Head Office', 'Production Lead'],
  ['Layla Haddad', 'Sales', 'Head Office', 'Account Manager'],
  ['Daniel Brooks', 'Sales', 'Remote', 'Sales Executive'],
  ['Aisha Rahman', 'Finance', 'Head Office', 'Financial Analyst'],
  ['Vikram Patel', 'Logistics', 'Warehouse', 'Dispatch Lead'],
  ['Chen Wei', 'IT', 'Remote', 'Developer'],
  ['Grace Kim', 'Administration', 'Head Office', 'Office Manager'],
  ['Yusuf Ibrahim', 'Operations', 'Site A', 'Machine Operator'],
  ['Noura Saleh', 'Sales', 'Head Office', 'Sales Coordinator'],
  ['Rahul Menon', 'Operations', 'Warehouse', 'Packer'],
  ['Elena Petrova', 'Finance', 'Remote', 'Accountant'],
  ['Hassan Ali', 'Logistics', 'Warehouse', 'Driver'],
  ['Meera Nair', 'Administration', 'Head Office', 'Receptionist'],
  ['Tariq Aziz', 'Maintenance', 'Site B', 'Electrician'],
  ['Sophie Martin', 'HR', 'Head Office', 'Recruiter'],
  ['Arjun Reddy', 'Operations', 'Site A', 'Quality Inspector'],
  ['Khalid Mansour', 'Operations', 'Head Office', 'Shift Supervisor'],
  ['Nadia Yousef', 'Sales', 'Remote', 'Key Account Lead'],
  ['Peter Novak', 'Logistics', 'Warehouse', 'Inventory Controller'],
  ['Zainab Bello', 'Facilities', 'Site A', 'Cleaning Supervisor'],
  ['Samir Gupta', 'IT', 'Head Office', 'Support Engineer'],
  ['Hana Takeda', 'Operations', 'Site B', 'Line Operator'],
  ['Ibrahim Saeed', 'Safety', 'Site A', 'Safety Marshal'],
  ['Lucy Evans', 'Administration', 'Remote', 'Executive Assistant'],
  ['Mohammed Rafi', 'Operations', 'Warehouse', 'Picker'],
  ['Anita Desai', 'Finance', 'Head Office', 'Payroll Specialist'],
  ['George Okafor', 'Logistics', 'Warehouse', 'Fleet Coordinator'],
  ['Reem Khalil', 'Sales', 'Head Office', 'Inside Sales'],
];
const STATUS: Employee['status'][] = ['Present', 'Present', 'Present', 'Late', 'Present', 'Remote', 'Present', 'Absent', 'Present', 'On Leave', 'Present'];
export const EMPLOYEES: Employee[] = NAMED.map(([name, dept, site, role, cert, days], i) => {
  const h = (i * 37 + name.length * 11) % 100;
  const ot = dept === 'Operations' ? 9 + (h % 9) : dept === 'Logistics' ? 6 + (h % 7) : h % 6;
  const late = dept === 'Sales' ? 4 + (h % 5) : h % 4;
  const risk = Math.min(92, Math.round(ot * 2.6 + late * 4 + (h % 30) + (dept === 'Sales' ? 18 : 0)));
  const drivers = [ot > 12 && 'High overtime', late > 4 && 'Frequent late arrivals', h % 3 === 0 && 'No promotion in 3 yrs', h % 4 === 1 && 'Low engagement score', dept === 'Sales' && 'Below-target commission']
    .filter(Boolean)
    .slice(0, 2)
    .join(', ') || 'Long commute';
  return {
    id: `EMP-${1040 + i * 17}`,
    name,
    initials: initialsOf(name),
    avatar: colorOf(name),
    dept,
    site,
    role,
    overtime: ot,
    late,
    absences: (h % 7) + (dept === 'Sales' ? 3 : 0),
    risk,
    drivers,
    engagement: Math.max(48, 92 - Math.round(risk / 2.2)),
    tenure: 1 + (h % 11),
    cert: cert ? { name: cert, days: days! } : undefined,
    status: site === 'Remote' ? 'Remote' : STATUS[i % STATUS.length],
  };
});
export const EXPIRING = EMPLOYEES.filter((e) => e.cert && e.cert.days <= 30).sort((a, b) => a.cert!.days - b.cert!.days);
export const empByName = (q: string) => EMPLOYEES.find((e) => q.toLowerCase().includes(e.name.toLowerCase()) || q.toLowerCase().includes(e.name.split(' ')[0].toLowerCase() + ' '));

/* ------------------------------------------------------------------ spaces & assets */
export const ROOMS = [
  { name: 'Orion', floor: 'Floor 3', cap: 8, free: 'Now – 11:30', av: true, gear: 'Display, VC' },
  { name: 'Nova', floor: 'Floor 2', cap: 4, free: 'Now – 12:00', av: true, gear: 'Display' },
  { name: 'Atlas', floor: 'Floor 5', cap: 12, free: '11:00 – 13:00', av: false, gear: 'Projector, VC' },
  { name: 'Lyra', floor: 'Floor 2', cap: 6, free: 'Now – 14:00', av: true, gear: 'Whiteboard' },
  { name: 'Vega', floor: 'Floor 4', cap: 10, free: 'Now – 10:45', av: true, gear: 'Display, VC' },
  { name: 'Polaris', floor: 'Floor 1', cap: 20, free: '14:00 – 17:00', av: false, gear: 'Projector, Audio' },
];
export const ASSET_UTIL = [
  { site: 'Head Office', util: 72, assets: 1840 },
  { site: 'Warehouse', util: 84, assets: 960 },
  { site: 'Site A', util: 66, assets: 610 },
  { site: 'Site B', util: 58, assets: 420 },
  { site: 'Logistics Hub', util: 79, assets: 380 },
];
export const SPACE_UTIL = { meetingPeak: 78, deskAvg: 61, underused: ['Floor 4 East wing (34%)', 'Floor 1 Collaboration zone (41%)', 'Site B Training room (22%)'] };
export const INCIDENTS = [
  { id: 'NM-2614', type: 'Near miss', where: 'Warehouse · Aisle 7', what: 'Forklift reversed without spotter', time: '08:42', sev: 'Medium' },
  { id: 'NM-2615', type: 'Near miss', where: 'Warehouse · Dock 2', what: 'Pallet stack leaning, nearly fell', time: '09:55', sev: 'Medium' },
  { id: 'OB-1182', type: 'Observation', where: 'Site A · Line 3', what: 'Guard missing on conveyor', time: '07:30', sev: 'Low' },
];

/* ------------------------------------------------------------------ anomalies */
export type Sev = 'High' | 'Medium' | 'Low' | 'Info';
export type AStatus = 'Open' | 'Acknowledged' | 'Resolved' | 'False Positive';
export interface Anomaly {
  id: string;
  title: string;
  category: 'Attendance' | 'Access' | 'Canteen' | 'Space' | 'Overtime' | 'Safety' | 'Device';
  severity: Sev;
  dot: string;
  ago: string;
  minutes: number;
  site: string;
  scope: string;
  deviation: number; // %
  score: number; // anomaly score 0-100
  desc: string;
  labels: string[];
  observed: number[];
  baseline: number[];
  unit: string;
  status: AStatus;
  isNew?: boolean;
}
const H14 = ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19'].map((h) => h + ':00');
const D14 = Array.from({ length: 14 }, (_, i) => shortDay(i - 13));
const wave = (base: number, amp: number, k: number) => Array.from({ length: 14 }, (_, i) => +(base + Math.sin(i * 0.9 + k) * amp).toFixed(1));
const spike = (arr: number[], from: number, mult: number) => arr.map((v, i) => (i >= from ? +(v * mult).toFixed(1) : v));
export const ANOMALIES: Anomaly[] = [
  { id: 'AN-301', title: 'High overtime hours in Operations this week', category: 'Overtime', severity: 'Medium', dot: 'var(--ka-ef4444)', ago: '2 hours ago', minutes: 120, site: 'Head Office', scope: 'Operations · 383 employees', deviation: 31, score: 78, desc: 'Operations logged 2,140 overtime hours this week, 31% above the 8-week baseline. 42 employees exceeded 12 h. Driven by two unfilled night-shift rosters.', labels: D14, baseline: wave(1600, 60, 1), observed: spike(wave(1610, 70, 1.3), 9, 1.31), unit: 'h', status: 'Open' },
  { id: 'AN-302', title: 'Repeated access denied attempts at Gate 3', category: 'Access', severity: 'High', dot: 'var(--ka-ef4444)', ago: '5 hours ago', minutes: 300, site: 'Warehouse', scope: 'Gate 3 · Reader R-3A', deviation: 420, score: 94, desc: '17 denied badge attempts within 25 minutes, 11 from the same expired contractor credential (CTR-2291). Pattern matches credential sharing.', labels: H14, baseline: wave(1.2, 0.6, 0), observed: spike(wave(1.3, 0.7, 0.4), 4, 5.2), unit: 'denials', status: 'Open' },
  { id: 'AN-303', title: 'Canteen peak usage between 12:00 - 1:00 PM', category: 'Canteen', severity: 'Info', dot: 'var(--ka-3b82f6)', ago: '1 day ago', minutes: 1440, site: 'Head Office', scope: 'Main canteen · 420 seats', deviation: 22, score: 52, desc: 'Peak occupancy reached 96% between 12:00 and 13:00, 22% higher than usual. Queue times averaged 11 min. Staggered lunch slots would flatten the peak.', labels: H14, baseline: [5, 8, 12, 15, 30, 62, 78, 64, 30, 14, 9, 6, 4, 3], observed: [5, 9, 13, 16, 34, 74, 96, 72, 31, 15, 9, 6, 4, 3], unit: '% seats', status: 'Open' },
  { id: 'AN-304', title: 'Meeting room no-shows increased by 18%', category: 'Space', severity: 'Medium', dot: 'var(--ka-f59e0b)', ago: '1 day ago', minutes: 1500, site: 'Head Office', scope: '38 meeting rooms', deviation: 18, score: 66, desc: 'Booked-but-unused meetings rose to 23% of all bookings (baseline 19.5%). Floors 3 and 4 account for 70% of no-shows. Auto-release after 10 min is recommended.', labels: D14, baseline: wave(19.5, 1, 2), observed: spike(wave(19.8, 1.2, 2.2), 8, 1.18), unit: '%', status: 'Open' },
  { id: 'AN-305', title: '5% higher absenteeism in Sales this week', category: 'Attendance', severity: 'Medium', dot: 'var(--ka-f59e0b)', ago: '3 hours ago', minutes: 180, site: 'Head Office', scope: 'Sales · 76 employees', deviation: 5, score: 71, desc: 'Sales absenteeism is 7.9% vs 2.9% baseline. Unplanned absences cluster on Mondays and Fridays, and late arrivals doubled this month.', labels: D14, baseline: wave(2.9, 0.4, 1), observed: spike(wave(3.1, 0.5, 1.4), 7, 2.5), unit: '%', status: 'Open' },
  { id: 'AN-306', title: 'After-hours badge-in at Server Room', category: 'Access', severity: 'High', dot: 'var(--ka-ef4444)', ago: '9 hours ago', minutes: 540, site: 'Head Office', scope: 'Server Room · Floor 1', deviation: 300, score: 89, desc: 'Badge EMP-1312 entered the server room at 02:14 with no change ticket. Employee normally works 08:00-17:00. Access was granted by a legacy rule.', labels: H14, baseline: wave(0.4, 0.3, 0), observed: spike(wave(0.4, 0.3, 0), 10, 4), unit: 'entries', status: 'Acknowledged' },
  { id: 'AN-307', title: 'Unusual temperature spike in Cold Store 2', category: 'Device', severity: 'Medium', dot: 'var(--ka-f59e0b)', ago: '6 hours ago', minutes: 360, site: 'Warehouse', scope: 'Sensor TS-CS2-04', deviation: 40, score: 63, desc: 'Cold store temperature rose to 7.4 °C for 35 min (threshold 5 °C). Door-open sensor shows the door held open during a delivery.', labels: H14, baseline: wave(3.2, 0.3, 0), observed: spike(wave(3.3, 0.4, 0.5), 8, 2.1), unit: '°C', status: 'Resolved' },
  { id: 'AN-308', title: 'Late arrivals spike at Site B (Line 2)', category: 'Attendance', severity: 'Low', dot: 'var(--ka-22c55e)', ago: '1 day ago', minutes: 1600, site: 'Site B', scope: 'Line 2 · 46 employees', deviation: 14, score: 44, desc: 'Late arrivals rose 14% after the shuttle timetable changed on Monday. 9 employees affected repeatedly.', labels: D14, baseline: wave(4, 0.6, 3), observed: spike(wave(4, 0.6, 3), 9, 1.4), unit: 'late', status: 'Open' },
  { id: 'AN-309', title: 'Near-miss rate doubled in Warehouse', category: 'Safety', severity: 'High', dot: 'var(--ka-ef4444)', ago: '4 hours ago', minutes: 240, site: 'Warehouse', scope: 'Aisles 5-9 · Dock area', deviation: 100, score: 86, desc: '2 near-miss incidents reported today and 6 this week (baseline 3). Both involve forklift movements in Aisle 7 during the shift change.', labels: D14, baseline: wave(0.4, 0.2, 1), observed: spike(wave(0.45, 0.2, 1), 10, 2), unit: 'incidents', status: 'Open' },
  { id: 'AN-310', title: 'Duplicate clock-ins from same device', category: 'Attendance', severity: 'Low', dot: 'var(--ka-22c55e)', ago: '2 days ago', minutes: 2900, site: 'Site A', scope: 'Terminal T-A-07', deviation: 12, score: 39, desc: '4 employees clocked in within 3 seconds of each other on terminal T-A-07. Possible buddy punching; face match confidence was low.', labels: D14, baseline: wave(1, 0.3, 0), observed: spike(wave(1, 0.3, 0), 11, 1.6), unit: 'events', status: 'False Positive' },
];
/** Pool of anomalies that "arrive" live on the anomaly page. */
export const ANOMALY_POOL: Omit<Anomaly, 'id' | 'ago' | 'minutes' | 'status'>[] = [
  { title: 'Tailgating detected at Turnstile 2', category: 'Access', severity: 'High', dot: 'var(--ka-ef4444)', site: 'Head Office', scope: 'Lobby · Turnstile 2', deviation: 250, score: 88, desc: 'Two people passed on a single badge swipe within 1.2 s. Camera C-LB-02 confirms the second person was not badged.', labels: H14, baseline: wave(0.5, 0.3, 0), observed: spike(wave(0.5, 0.3, 0), 12, 3.5), unit: 'events' },
  { title: 'Desk occupancy drop on Floor 4', category: 'Space', severity: 'Low', dot: 'var(--ka-22c55e)', site: 'Head Office', scope: 'Floor 4 · 120 desks', deviation: -27, score: 41, desc: 'Desk occupancy is 27% below the Thursday baseline. Team Finance moved to hybrid schedule this week.', labels: D14, baseline: wave(62, 3, 1), observed: spike(wave(61, 3, 1), 10, 0.73), unit: '%' },
  { title: 'Overtime surge in Logistics night shift', category: 'Overtime', severity: 'Medium', dot: 'var(--ka-f59e0b)', site: 'Warehouse', scope: 'Logistics · Night shift', deviation: 24, score: 69, desc: 'Night-shift overtime is 24% above baseline for 3 consecutive days due to inbound container backlog.', labels: D14, baseline: wave(180, 10, 2), observed: spike(wave(182, 10, 2), 11, 1.24), unit: 'h' },
];

/* ------------------------------------------------------------------ recommendations */
export type RStatus = 'Open' | 'In Progress' | 'Done' | 'Dismissed' | 'Snoozed';
export interface Rec {
  id: string;
  title: string;
  category: 'Safety' | 'Compliance' | 'Workspace' | 'Attendance' | 'Scheduling' | 'Wellbeing' | 'Cost';
  icon: string;
  color: string;
  action: string;
  impact: 'High' | 'Medium' | 'Low';
  confidence: number;
  savings: number; // AED / month
  affected: number;
  why: string;
  steps: string[];
  people: string[];
  status: RStatus;
  link?: string;
}
export const RECS: Rec[] = [
  { id: 'RC-01', title: 'Schedule safety training for 8 employees', category: 'Safety', icon: 'ai-first-aid', color: 'var(--ka-ef4444)', action: 'Create Task', impact: 'High', confidence: 93, savings: 18000, affected: 8, why: '8 employees hold safety certifications that expire within 30 days. Lapsed certification blocks site access for 3 of them, which would leave the Warehouse day shift short.', steps: ['Book a First Aid / Fire Safety session next week', 'Assign the 8 employees and notify managers', 'Track completion in Training & Compliance'], people: EXPIRING.map((e) => e.name), status: 'Open', link: '/training-skills-compliance/renewals-expiry-alerts' },
  { id: 'RC-02', title: 'Send certification renewal reminders', category: 'Compliance', icon: 'id-card', color: 'var(--ka-f59e0b)', action: 'Send Reminder', impact: 'Medium', confidence: 97, savings: 6000, affected: 8, why: 'Reminders sent 3+ weeks ahead raise on-time renewals from 61% to 92% in past cycles.', steps: ['Email + push reminder to each holder', 'CC line managers', 'Re-send automatically 7 days before expiry'], people: EXPIRING.map((e) => e.name), status: 'Open' },
  { id: 'RC-03', title: 'Optimize workspace allocation (underutilized areas)', category: 'Workspace', icon: 'ai-layout', color: 'var(--ka-3b82f6)', action: 'View Suggestion', impact: 'High', confidence: 84, savings: 42000, affected: 120, why: 'Floor 4 East wing averages 34% desk utilization while Floor 2 runs at 91%. Consolidating 2 teams frees 46 desks.', steps: ['Move Finance and HR to Floor 2 neighbourhoods', 'Convert Floor 4 East into bookable hot-desks', 'Reduce cleaning & HVAC schedule for freed area'], people: ['Finance team', 'HR team'], status: 'Open', link: '/workplace-facility-services/space-utilization' },
  { id: 'RC-04', title: 'Review late attendance for Sales department', category: 'Attendance', icon: 'file-text', color: 'var(--ka-ef4444)', action: 'View Report', impact: 'Medium', confidence: 88, savings: 9000, affected: 76, why: 'Sales has the lowest attendance rate (89.5%) and late arrivals doubled this month. 6 employees account for 64% of late minutes.', steps: ['Share late-arrival report with Sales manager', 'Review flexible start-time policy', 'Follow up in 2 weeks'], people: EMPLOYEES.filter((e) => e.dept === 'Sales').map((e) => e.name), status: 'Open', link: '/time-attendance/attendance-reports-analytics' },
  { id: 'RC-05', title: 'Add a 4th night-shift crew in Operations', category: 'Scheduling', icon: 'calendar-days', color: 'var(--ka-8b5cf6)', action: 'Open Roster', impact: 'High', confidence: 81, savings: 36000, affected: 42, why: 'Overtime in Operations is 31% above baseline; 42 employees exceed 12 h/week. A 4th crew of 9 costs less than the current overtime premium.', steps: ['Draft roster with 9 additional operators', 'Re-balance overtime caps to 8 h/week', 'Monitor fatigue risk score'], people: EMPLOYEES.filter((e) => e.dept === 'Operations').map((e) => e.name), status: 'Open', link: '/shift-workforce/roster-planning' },
  { id: 'RC-06', title: 'Stagger canteen lunch slots by department', category: 'Wellbeing', icon: 'coffee', color: 'var(--ka-0891b2)', action: 'Apply Slots', impact: 'Low', confidence: 79, savings: 3000, affected: 420, why: 'Peak occupancy hits 96% between 12:00 and 13:00. Three 30-minute waves would cut queue time from 11 to 4 min.', steps: ['Assign lunch waves 12:00 / 12:30 / 13:00', 'Notify via mobile app', 'Re-measure in 2 weeks'], people: ['All Head Office staff'], status: 'Open' },
  { id: 'RC-07', title: 'Auto-release meeting rooms after 10 min no-show', category: 'Workspace', icon: 'users', color: 'var(--ka-3b82f6)', action: 'Enable Rule', impact: 'Medium', confidence: 90, savings: 5000, affected: 38, why: 'No-shows rose 18%. Auto-release recovers ~140 room-hours a week across 38 rooms.', steps: ['Enable occupancy-sensor auto release', 'Send organiser reminder at 5 min'], people: ['38 meeting rooms'], status: 'Open' },
  { id: 'RC-08', title: 'Retention check-ins for 23 high-risk employees', category: 'Wellbeing', icon: 'heart', color: 'var(--ka-db2777)', action: 'Schedule 1:1s', impact: 'High', confidence: 76, savings: 64000, affected: 23, why: 'The attrition model flags 23 employees above 60% risk, mainly from overtime and late-arrival patterns. Replacing each costs ~AED 28k.', steps: ['Schedule manager 1:1s this month', 'Offer flexible shift options', 'Re-score risk after 30 days'], people: EMPLOYEES.filter((e) => e.risk >= 60).map((e) => e.name), status: 'Open', link: '/ai-people-intelligence/predictive-analytics' },
  { id: 'RC-09', title: 'Revoke expired contractor badge CTR-2291', category: 'Safety', icon: 'shield', color: 'var(--ka-ef4444)', action: 'Revoke Badge', impact: 'High', confidence: 98, savings: 0, affected: 1, why: '11 denied attempts at Gate 3 came from this expired credential. It may have been shared.', steps: ['Revoke credential', 'Notify contractor company', 'Review Gate 3 footage'], people: ['CTR-2291 (Al Noor Facilities)'], status: 'In Progress' },
  { id: 'RC-10', title: 'Switch Site B shuttle to 07:10 departure', category: 'Cost', icon: 'truck', color: 'var(--ka-16a34a)', action: 'Apply', impact: 'Low', confidence: 72, savings: 2500, affected: 46, why: 'Late arrivals at Site B Line 2 rose 14% after the timetable change.', steps: ['Move departure 10 min earlier', 'Notify riders'], people: ['Site B Line 2'], status: 'Done' },
];

/* ------------------------------------------------------------------ predictions */
export const MODELS = [
  { id: 'M1', name: 'Attendance Forecast', algo: 'Gradient boosting · 46 features', accuracy: 94.1, trained: '2 days ago', status: 'Healthy' },
  { id: 'M2', name: 'Attrition Risk', algo: 'Logistic ensemble · 31 features', accuracy: 88.6, trained: '6 days ago', status: 'Healthy' },
  { id: 'M3', name: 'Overtime Forecast', algo: 'Prophet + regressors', accuracy: 91.2, trained: '1 day ago', status: 'Healthy' },
  { id: 'M4', name: 'Space Demand', algo: 'LSTM · occupancy sensors', accuracy: 86.3, trained: '14 days ago', status: 'Drift detected' },
];
export const FORECAST_WEEKS = ['W43', 'W44', 'W45', 'W46', 'W47', 'W48', 'W49', 'W50'];
export const DEMAND = [1162, 1188, 1204, 1236, 1258, 1271, 1242, 1196]; // FTE needed
export const CAPACITY = 1176; // FTE available (present + late, not counting overtime)

/* ------------------------------------------------------------------ copilot types */
export type Cell = string | number | { text: string; cls?: string; av?: string; color?: string };
export type Block =
  | { t: 'text'; text: string }
  | { t: 'list'; items: string[] }
  | { t: 'table'; cols: string[]; rows: Cell[][]; limit?: number }
  | { t: 'donut'; segs: { label: string; value: number; color: string }[]; center: string; value?: string }
  | { t: 'bars'; rows: { label: string; value: number; display?: string; color?: string }[]; max: number }
  | { t: 'line'; labels: string[]; series: Series[]; suffix?: string }
  | { t: 'column'; labels: string[]; series: Series[]; stacked?: boolean }
  | { t: 'kpis'; items: { label: string; value: string; color: string }[] }
  | { t: 'person'; emp: Employee };
export interface ChatAction {
  label: string;
  kind: 'nav' | 'prompt' | 'csv' | 'remind' | 'task' | 'toast' | 'book' | 'expand' | 'alert';
  arg?: string;
  primary?: boolean;
}
export interface Msg {
  id: number;
  role: 'user' | 'bot';
  time: string;
  text?: string; // user
  blocks?: Block[];
  actions?: ChatAction[];
  suggestions?: string[];
  rating?: 'up' | 'down';
  expanded?: boolean;
}
export interface Conversation {
  id: number;
  title: string;
  when: string;
  msgs: Msg[];
}
export interface SavedReport {
  id: number;
  title: string;
  query: string;
  created: string;
  schedule?: string;
}

/* ------------------------------------------------------------------ store */
@Injectable({ providedIn: 'root' })
export class AiStore {
  private nextId = 1000;
  readonly anomalies = signal<Anomaly[]>(ANOMALIES.map((a) => ({ ...a })));
  readonly recs = signal<Rec[]>(RECS.map((r) => ({ ...r })));
  readonly reminded = signal<Set<string>>(new Set());
  readonly tasks = signal<{ id: number; title: string; when: string }[]>([]);
  readonly alerts = signal<{ id: number; rule: string; when: string }[]>([
    { id: 1, rule: 'Attendance rate below 85% for any department', when: 'Active · since 02 Oct' },
    { id: 2, rule: 'More than 5 access denials in 10 min at any gate', when: 'Active · since 18 Sep' },
  ]);
  readonly savedPrompts = signal<string[]>([
    "Show today's attendance summary by department at Head Office",
    'List employees with expiring certifications in next 30 days',
    'Which department has the highest overtime this week?',
    'Who is at risk of leaving?',
    'Show asset utilization by site',
  ]);
  readonly reports = signal<SavedReport[]>([
    { id: 1, title: 'Weekly Attendance by Department', query: 'attendance rate by department this week', created: dayLabel(-6), schedule: 'Every Monday 08:00' },
    { id: 2, title: 'Overtime Hours by Department', query: 'overtime hours by department this month', created: dayLabel(-3) },
    { id: 3, title: 'Headcount Trend (12 months)', query: 'headcount trend by month', created: dayLabel(-1) },
  ]);
  /** Prompt queued by another page (e.g. "Ask Copilot" buttons) for the copilot to send on open. */
  readonly pending = signal<string | null>(null);

  readonly conversations = signal<Conversation[]>(seedConversations());
  readonly currentId = signal(1);
  readonly current = computed(() => this.conversations().find((c) => c.id === this.currentId())!);

  id() {
    return ++this.nextId;
  }
  pushMsg(m: Msg) {
    this.conversations.update((list) =>
      list.map((c) => (c.id === this.currentId() ? { ...c, msgs: [...c.msgs, m], title: c.msgs.length ? c.title : (m.text ?? 'New conversation').slice(0, 48) } : c)),
    );
  }
  patchMsg(id: number, ch: Partial<Msg>) {
    this.conversations.update((list) => list.map((c) => ({ ...c, msgs: c.msgs.map((m) => (m.id === id ? { ...m, ...ch } : m)) })));
  }
  newConversation() {
    const cur = this.current();
    if (cur && !cur.msgs.length) return;
    const id = this.id();
    this.conversations.update((l) => [{ id, title: 'New conversation', when: 'Today · ' + nowTime(), msgs: [] }, ...l]);
    this.currentId.set(id);
  }
  deleteConversation(id: number) {
    this.conversations.update((l) => l.filter((c) => c.id !== id));
    if (this.currentId() === id) {
      if (!this.conversations().length) this.conversations.set([{ id: this.id(), title: 'New conversation', when: 'Today · ' + nowTime(), msgs: [] }]);
      this.currentId.set(this.conversations()[0].id);
    }
  }
  patchRec(id: string, ch: Partial<Rec>) {
    this.recs.update((l) => l.map((r) => (r.id === id ? { ...r, ...ch } : r)));
  }
  patchAnomaly(id: string, ch: Partial<Anomaly>) {
    this.anomalies.update((l) => l.map((a) => (a.id === id ? { ...a, ...ch } : a)));
  }
  remind(names: string[]) {
    this.reminded.update((s) => new Set([...s, ...names]));
    this.patchRec('RC-02', { status: 'Done' });
  }
  addTask(title: string) {
    this.tasks.update((l) => [{ id: this.id(), title, when: nowTime() }, ...l]);
  }
}

function seedConversations(): Conversation[] {
  return [
    {
      id: 1,
      title: "Today's attendance summary by department",
      when: 'Today · 10:22 AM',
      msgs: [
        { id: 1, role: 'user', time: '10:22 AM', text: "Show me today's attendance summary by department at Head Office." },
        { id: 2, role: 'bot', time: '10:22 AM', ...attendanceAnswer() },
        { id: 3, role: 'user', time: '10:23 AM', text: 'List employees with expiring certifications in next 30 days.' },
        { id: 4, role: 'bot', time: '10:23 AM', ...certAnswer() },
      ],
    },
    { id: 2, title: 'Overtime by department this week', when: 'Yesterday · 4:12 PM', msgs: [] },
    { id: 3, title: 'Who is in the office right now?', when: 'Yesterday · 9:03 AM', msgs: [] },
    { id: 4, title: 'Asset utilization by site', when: dayLabel(-3) + ' · 2:40 PM', msgs: [] },
  ];
}

/* ------------------------------------------------------------------ canned answers */
export type Answer = Pick<Msg, 'blocks' | 'actions' | 'suggestions'>;
const attCls = (p: number) => (p >= 96 ? 'amber' : p >= 93 ? 'green' : p >= 91 ? 'lime' : 'red');
export function attendanceAnswer(): Answer {
  return {
    blocks: [
      { t: 'text', text: "Here's today's attendance summary by department at Head Office." },
      {
        t: 'table',
        cols: ['Department', 'Total', 'Present', 'Absent', 'Late', 'Attendance %'],
        rows: HO_DEPTS.map((d) => {
          const p = pct(d.present, d.total);
          return [d.name, d.total, d.present, { text: String(d.absent), cls: 'red-t' }, d.late, { text: p.toFixed(1) + '%', cls: 'pill ' + attCls(p) }];
        }),
      },
    ],
    actions: [
      { label: 'View Detailed Report', kind: 'nav', arg: '/ai-people-intelligence/natural-language-reports?q=attendance rate by department today' },
      { label: 'Show in Dashboard', kind: 'nav', arg: '/ai-people-intelligence/workforce-insights' },
    ],
  };
}
export function certAnswer(): Answer {
  return {
    blocks: [
      { t: 'text', text: `Here are ${EXPIRING.length} employees with certifications expiring in the next 30 days.` },
      {
        t: 'table',
        limit: 5,
        cols: ['Employee', 'Department', 'Certification', 'Expiry Date', 'Days Left'],
        rows: EXPIRING.map((e) => [
          { text: e.name, av: e.initials, color: e.avatar },
          e.dept,
          e.cert!.name,
          dayLabel(e.cert!.days),
          { text: String(e.cert!.days), cls: 'days ' + (e.cert!.days <= 6 ? 'red' : e.cert!.days <= 10 ? 'amber' : 'orange') },
        ]),
      },
    ],
    actions: [
      { label: `View All (${EXPIRING.length})`, kind: 'expand' },
      { label: 'Send Reminder', kind: 'remind' },
      { label: 'Create Training Task', kind: 'task', arg: `Safety training for ${EXPIRING.length} employees with expiring certifications` },
    ],
  };
}
