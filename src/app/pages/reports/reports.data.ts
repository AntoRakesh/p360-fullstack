// Reports & Analytics: one shared catalogue + root store so runs, schedules, exports, shares and
// audit entries made on any page show up on every other page of the module.
import { Injectable, computed, signal } from '@angular/core';

export const ME = 'You';
export const TODAY = '2026-10-14';
export type RType = 'Standard' | 'Custom';

export interface Report {
  id: string;
  name: string;
  module: string;
  category: string;
  type: RType;
  updated: string; // ISO date
  createdBy: string;
  description: string;
  icon: string;
  color: string;
  runs: number; // runs this month
  favorite: boolean;
  lastRun?: string;
}

interface CatDef {
  category: string;
  module: string;
  icon: string;
  color: string;
  names: string[];
  desc: string;
}

// Category → module, icon, colour and report names. Counts: 28+16+18+14+16+14+12+12+8+4 = 142.
const CATS: CatDef[] = [
  { category: 'Attendance', module: 'Time & Attendance', icon: 'calendar-days', color: '#7c3aed', desc: 'attendance, punctuality and working-hour insights', names: ['Employee Attendance Summary', 'Daily Attendance Register', 'Late Arrivals Report', 'Early Departures Report', 'Overtime Summary', 'Absenteeism Analysis', 'Work From Home Summary', 'Shift Adherence Report', 'Missed Punch Report', 'Attendance Regularization Log', 'Working Hours by Employee', 'Monthly Attendance Muster', 'Attendance Exceptions', 'Night Shift Attendance', 'Weekend Attendance', 'Holiday Work Report', 'Attendance by Department', 'Attendance by Site', 'Punctuality Scorecard', 'Break Duration Analysis', 'Overtime Cost Report', 'Attendance Trend (12 Months)', 'Biometric Device Punches', 'Geo-fenced Mobile Check-ins', 'First-In Last-Out Report', 'Absent Without Leave', 'Timesheet Approval Status', 'Payroll Attendance Export'] },
  { category: 'Leave', module: 'Leave & Absence', icon: 'calendar-x', color: '#f59e0b', desc: 'leave balances, applications and absence patterns', names: ['Leave Balance Report', 'Leave Applications Register', 'Leave Liability Report', 'Sick Leave Analysis', 'Annual Leave Utilization', 'Leave Approval Turnaround', 'Unplanned Absence Report', 'Return to Work Report', 'Leave Encashment Summary', 'Carry Forward Balances', 'Leave by Department', 'Holiday Calendar Coverage', 'Maternity & Paternity Leave', 'Leave Trend Analysis', 'Bradford Factor Report', 'Pending Leave Approvals'] },
  { category: 'Security', module: 'Physical Access Control', icon: 'shield', color: '#3b82f6', desc: 'door events, access rights and security exceptions', names: ['Access Control Events', 'Denied Access Attempts', 'Door Held Open Alarms', 'Forced Door Events', 'Access Rights Review', 'Anti-Passback Violations', 'Badge Issuance Report', 'Lost & Inactive Badges', 'After-Hours Access', 'Restricted Zone Entries', 'Tailgating Detections', 'Door Usage Statistics', 'Reader Health Report', 'Access Level Changes', 'Guard Patrol Summary', 'Checkpoint Compliance', 'Patrol Incident Log', 'Guard Attendance Report'] },
  { category: 'Visitors', module: 'Visitor Management', icon: 'users', color: '#22c55e', desc: 'visitor volumes, hosts, dwell time and pre-registrations', names: ['Visitor Trend Analysis', 'Daily Visitor Log', 'Visitors by Host', 'Visitor Dwell Time', 'Pre-Registration Report', 'Watchlist Hits', 'Visitor Badge Returns', 'Vehicle Entry Log', 'VIP Visits Summary', 'Visitor Feedback', 'No-Show Visitors', 'Visitor Peak Hours', 'Visitors by Purpose', 'Visitor NDA Compliance'] },
  { category: 'Workforce', module: 'Contractor Management', icon: 'hard-hat', color: '#f97316', desc: 'contractor and workforce headcount, compliance and deployment', names: ['Contractor Headcount', 'Contractor Compliance Status', 'Work Permit Register', 'Vendor Performance', 'Contractor On-Site Hours', 'Contract Expiry Report', 'Headcount by Department', 'New Joiners Report', 'Leavers & Attrition', 'Workforce Demographics', 'Span of Control', 'Shift Roster Coverage', 'Task Completion Report', 'Workforce Productivity', 'Contractor Induction Status', 'Manpower Cost Report'] },
  { category: 'Facilities', module: 'Digital Twin & Spatial', icon: 'building', color: '#7c3aed', desc: 'utilization insights for desks, meeting rooms and collaboration spaces across sites', names: ['Space Utilization Report', 'Desk Booking Report', 'Meeting Room Usage', 'Occupancy by Floor', 'Peak Occupancy Report', 'No-Show Bookings', 'Hot Desk Utilization', 'Facility Service Requests', 'Cleaning Schedule Compliance', 'Asset Utilization', 'Energy vs Occupancy', 'Parking Utilization', 'Space Cost per Employee', 'Zone Dwell Time'] },
  { category: 'Training', module: 'Training, Skills & Compliance', icon: 'graduation-cap', color: '#10b981', desc: 'mandatory training, certifications and skill coverage', names: ['Training Compliance Report', 'Certification Expiry', 'Course Completion Rates', 'Skills Matrix Report', 'Mandatory Training Gaps', 'Training Hours by Employee', 'Trainer Effectiveness', 'Induction Completion', 'Safety Training Status', 'Assessment Scores', 'Training Cost Report', 'Learning Path Progress'] },
  { category: 'Safety', module: 'Workplace Safety', icon: 'triangle-alert', color: '#ef4444', desc: 'incidents, near misses and safety observations', names: ['Safety Incident Report', 'Near Miss Report', 'Lost Time Injury Rate', 'PPE Compliance', 'Safety Observations', 'Risk Assessment Status', 'Corrective Actions Tracker', 'Emergency Drill Report', 'Muster Accountability', 'Hazard Register', 'Lone Worker Alerts', 'Wellbeing Check-ins'] },
  { category: 'Canteen', module: 'Meal & Canteen', icon: 'utensils', color: '#f59e0b', desc: 'meal consumption, wastage and canteen spend', names: ['Meal Consumption Report', 'Meal Wastage Analysis', 'Canteen Spend by Department', 'Meal Pre-Orders', 'Menu Popularity', 'Meal Subsidy Report', 'Canteen Footfall', 'Special Diet Requests'] },
  { category: 'Emergency', module: 'Emergency & Mustering', icon: 'siren', color: '#dc2626', desc: 'evacuations, mustering and emergency readiness', names: ['Evacuation Summary', 'Muster Point Report', 'Warden Coverage', 'Emergency Response Times'] },
];

// The first ten rows of the library exactly as on the reference (module labels per screenshot).
const PINNED: [string, string, string][] = [
  ['Employee Attendance Summary', 'Time & Attendance', '2026-10-10'],
  ['Leave Balance Report', 'Leave & Absence', '2026-10-08'],
  ['Access Control Events', 'Physical Access Control', '2026-10-08'],
  ['Visitor Trend Analysis', 'Visitor Management', '2026-10-06'],
  ['Contractor Headcount', 'Contractor Management', '2026-10-05'],
  ['Space Utilization Report', 'Digital Twin & Spatial', '2026-10-04'],
  ['Training Compliance Report', 'Training, Skills & Compliance', '2026-10-03'],
  ['Safety Incident Report', 'Workplace Safety', '2026-10-02'],
  ['Meal Consumption Report', 'Meal & Canteen', '2026-10-01'],
  ['Guard Patrol Summary', 'Security Patrol', '2026-09-30'],
];
const PINNED_ICON: Record<string, [string, string]> = {
  'Employee Attendance Summary': ['calendar-days', '#7c3aed'],
  'Leave Balance Report': ['calendar-x', '#f59e0b'],
  'Access Control Events': ['shield', '#3b82f6'],
  'Visitor Trend Analysis': ['users', '#16a34a'],
  'Contractor Headcount': ['hard-hat', '#f59e0b'],
  'Space Utilization Report': ['building', '#7c3aed'],
  'Training Compliance Report': ['graduation-cap', '#22c55e'],
  'Safety Incident Report': ['triangle-alert', '#ef4444'],
  'Meal Consumption Report': ['utensils', '#f59e0b'],
  'Guard Patrol Summary': ['shield-check', '#6d28d9'],
};
const AUTHORS = ['Priya Nair', 'Omar Haddad', 'Sara Khan', 'Daniel Brooks', 'Aisha Rahman', ME, 'Lina Farouk', 'Rahul Mehta'];

const iso = (d: Date) => d.toISOString().slice(0, 10);
function build(): Report[] {
  const out: Report[] = [];
  let k = 0;
  for (const c of CATS) {
    c.names.forEach((name, i) => {
      const pin = PINNED.find((p) => p[0] === name);
      // Every 4th non-pinned report (from the 3rd) is a user-built custom report → 38 custom.
      const custom = !pin && (i % 4 === 2 || i % 4 === 3) && k % 2 === 0;
      const d = new Date(Date.UTC(2026, 8, 29));
      d.setUTCDate(d.getUTCDate() - ((k * 7 + i * 3) % 120));
      const [icon, color] = PINNED_ICON[name] ?? [c.icon, c.color];
      out.push({
        id: `RPT-${String(1001 + k).padStart(4, '0')}`,
        name,
        module: pin ? pin[1] : c.module,
        category: c.category,
        type: custom ? 'Custom' : 'Standard',
        updated: pin ? pin[2] : iso(d),
        createdBy: custom ? AUTHORS[k % AUTHORS.length] : 'System',
        description: name === 'Space Utilization Report' ? 'Provides utilization insights for desks, meeting rooms and collaboration spaces across sites.' : `${name} — ${c.desc} across all sites.`,
        icon,
        color,
        runs: 0,
        favorite: k % 9 === 0,
      });
      k++;
    });
  }
  // Make the custom count exactly 38.
  let customs = out.filter((r) => r.type === 'Custom');
  for (const r of out) {
    if (customs.length >= 38) break;
    if (r.type === 'Standard' && !PINNED.some((p) => p[0] === r.name) && +r.id.slice(4) % 5 === 3) {
      r.type = 'Custom';
      r.createdBy = AUTHORS[+r.id.slice(4) % AUTHORS.length];
      customs = out.filter((x) => x.type === 'Custom');
    }
  }
  while (customs.length > 38) {
    customs.pop()!.type = 'Standard';
  }
  out.filter((r) => r.type === 'Standard').forEach((r) => (r.createdBy = 'System'));
  // Runs this month sum to 1,256 (attendance reports run most).
  let total = 0;
  out.forEach((r, i) => {
    r.runs = (r.category === 'Attendance' ? 14 : 6) + ((i * 37) % 9);
    total += r.runs;
  });
  out[0].runs += 1256 - total;
  return out;
}
export const REPORTS: Report[] = build();

export const MODULES = [...new Set(REPORTS.map((r) => r.module))];
export const CATEGORIES = CATS.map((c) => c.category);
export const SITES = ['Head Office', 'Manufacturing', 'Warehouse', 'Logistics Hub', 'Retail Stores', 'Data Center'];
export const DEPARTMENTS = ['Engineering', 'Operations', 'Finance', 'HR', 'Sales', 'IT', 'Facilities', 'Security'];
export const ROLES = ['Administrator', 'HR Manager', 'Facility Manager', 'Security Manager', 'Department Head', 'Line Manager', 'Employee'];

export const fmtDate = (s: string) => {
  const d = new Date(s + (s.length === 10 ? 'T00:00:00' : ''));
  return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
};
export const fmtNum = (n: number) => n.toLocaleString('en-US');
export const hash = (s: string) => [...s].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7);
export const rnd = (seed: number) => {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const AV = ['#7c3aed', '#3b82f6', '#22c55e', '#f97316', '#ef4444', '#06b6d4', '#ec4899', '#64748b'];
export const avatarOf = (name: string) => AV[hash(name) % AV.length];
export const initials = (name: string) => name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

/* ---------------- Report preview model ---------------- */
export interface PreviewParams {
  site: string;
  range: string;
  building: string;
  floor: string;
  spaceType: string;
  department: string;
  compare: boolean;
}
export const DEFAULT_PARAMS: PreviewParams = { site: 'Head Office', range: 'Last 30 Days', building: 'All Buildings', floor: 'All Floors', spaceType: 'All Space Types', department: 'All Departments', compare: false };

interface Tpl {
  tabs: string[];
  donut: [string, string, string, string, string, number, number]; // title, centre, a, b, totals label, total, pct
  trend: [string, string[]];
  breakdown: [string, string[]];
  heat: string;
  unit: string;
}
const TPL: Record<string, Tpl> = {
  Facilities: { tabs: ['Summary', 'Utilization Trend', 'Space Type Analysis', 'Floor-wise Analysis', 'Department-wise Usage', 'Heatmap View'], donut: ['Overall Space Utilization', 'Utilization Rate', 'Occupied', 'Available', 'Total Spaces', 428, 68], trend: ['Space Utilization Trend', ['Desks', 'Meeting Rooms', 'Collaboration Areas']], breakdown: ['Utilization by Space Type', ['Open Desks', 'Meeting Rooms', 'Focus Rooms', 'Collaboration Areas', 'Cafeteria', 'Other Spaces']], heat: 'Space Heatmap', unit: 'spaces' },
  Attendance: { tabs: ['Summary', 'Attendance Trend', 'Status Analysis', 'Site-wise Analysis', 'Department-wise Attendance', 'Heatmap View'], donut: ['Overall Attendance', 'Attendance Rate', 'Present', 'Absent', 'Total Employees', 8594, 91], trend: ['Attendance Trend', ['On Time', 'Late', 'WFH']], breakdown: ['Attendance by Department', DEPARTMENTS.slice(0, 6)], heat: 'Check-in Heatmap', unit: 'employees' },
  Leave: { tabs: ['Summary', 'Leave Trend', 'Leave Type Analysis', 'Site-wise Analysis', 'Department-wise Leave', 'Heatmap View'], donut: ['Leave Balance Utilization', 'Utilized', 'Utilized', 'Remaining', 'Total Days', 18640, 42], trend: ['Leave Taken Trend', ['Annual', 'Sick', 'Other']], breakdown: ['Utilization by Leave Type', ['Annual Leave', 'Sick Leave', 'Casual Leave', 'Comp Off', 'Parental', 'Unpaid']], heat: 'Absence Heatmap', unit: 'days' },
  Security: { tabs: ['Summary', 'Event Trend', 'Event Type Analysis', 'Door-wise Analysis', 'Department-wise Access', 'Heatmap View'], donut: ['Access Outcome', 'Granted', 'Granted', 'Denied', 'Total Events', 2846, 94], trend: ['Access Events Trend', ['Granted', 'Denied', 'Alarms']], breakdown: ['Events by Type', ['Card Swipe', 'Face Recognition', 'Mobile Credential', 'PIN', 'Visitor QR', 'Manual Override']], heat: 'Access Heatmap', unit: 'events' },
  Visitors: { tabs: ['Summary', 'Visitor Trend', 'Purpose Analysis', 'Site-wise Analysis', 'Host Department', 'Heatmap View'], donut: ['Visitor Check-in Status', 'Checked In', 'Checked In', 'Expected', 'Total Visitors', 612, 74], trend: ['Visitor Trend', ['Walk-in', 'Pre-registered', 'VIP']], breakdown: ['Visitors by Purpose', ['Meeting', 'Interview', 'Delivery', 'Maintenance', 'Event', 'Other']], heat: 'Visitor Heatmap', unit: 'visitors' },
  Workforce: { tabs: ['Summary', 'Headcount Trend', 'Trade Analysis', 'Site-wise Analysis', 'Department-wise Headcount', 'Heatmap View'], donut: ['Contractor Compliance', 'Compliant', 'Compliant', 'Non-Compliant', 'Total Contractors', 3245, 86], trend: ['Headcount Trend', ['On Site', 'Off Site', 'New']], breakdown: ['Headcount by Trade', ['Electrical', 'Civil', 'MEP', 'Cleaning', 'Security', 'IT Services']], heat: 'Workforce Density Heatmap', unit: 'workers' },
  Training: { tabs: ['Summary', 'Completion Trend', 'Course Analysis', 'Site-wise Analysis', 'Department-wise Compliance', 'Heatmap View'], donut: ['Training Compliance', 'Compliant', 'Compliant', 'Overdue', 'Total Assignments', 24360, 87], trend: ['Completion Trend', ['Mandatory', 'Optional', 'Certifications']], breakdown: ['Completion by Course Type', ['Fire Safety', 'Code of Conduct', 'Data Privacy', 'First Aid', 'Leadership', 'Technical']], heat: 'Training Coverage Heatmap', unit: 'assignments' },
  Safety: { tabs: ['Summary', 'Incident Trend', 'Incident Type Analysis', 'Site-wise Analysis', 'Department-wise Incidents', 'Heatmap View'], donut: ['Incident Closure', 'Closed', 'Closed', 'Open', 'Total Incidents', 186, 81], trend: ['Incident Trend', ['Near Miss', 'First Aid', 'Lost Time']], breakdown: ['Incidents by Type', ['Slip / Trip', 'Manual Handling', 'Equipment', 'Electrical', 'Fire', 'Other']], heat: 'Incident Hotspots', unit: 'incidents' },
  Canteen: { tabs: ['Summary', 'Consumption Trend', 'Meal Type Analysis', 'Site-wise Analysis', 'Department-wise Consumption', 'Heatmap View'], donut: ['Meal Consumption', 'Consumed', 'Consumed', 'Wasted', 'Total Meals', 5280, 92], trend: ['Consumption Trend', ['Breakfast', 'Lunch', 'Dinner']], breakdown: ['Consumption by Meal Type', ['Lunch', 'Breakfast', 'Snacks', 'Dinner', 'Beverages', 'Special Diet']], heat: 'Canteen Footfall Heatmap', unit: 'meals' },
  Emergency: { tabs: ['Summary', 'Muster Trend', 'Muster Point Analysis', 'Site-wise Analysis', 'Department-wise Accountability', 'Heatmap View'], donut: ['Accountability', 'Accounted', 'Accounted', 'Missing', 'Total People', 842, 97], trend: ['Muster Time Trend', ['< 3 min', '3-6 min', '> 6 min']], breakdown: ['Accountability by Muster Point', ['Muster A', 'Muster B', 'Muster C', 'Muster D', 'Muster E', 'Muster F']], heat: 'Evacuation Flow Heatmap', unit: 'people' },
};
export const BREAK_COLORS = ['#10b981', '#2563eb', '#f59e0b', '#7c3aed', '#f43f5e', '#9ca3af'];
const SPACE_PCTS = [78, 65, 54, 62, 48, 36];
const SITE_F: Record<string, number> = { 'Head Office': 1, Manufacturing: 0.84, Warehouse: 0.55, 'Logistics Hub': 0.32, 'Retail Stores': 0.2, 'Data Center': 0.08, 'All Sites': 2.9 };

/** 18 trend points spanning the last 30 days (labels shown every 3rd: 15 Sep … 10 Oct). */
export function trendLabels(range: string) {
  const n = range === 'Last 7 Days' ? 7 : 18;
  const step = range === 'Last 7 Days' ? 1 : range === 'Last 90 Days' ? 5 : 5 / 3;
  const end = new Date(Date.UTC(2026, 9, 10));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - Math.round((n - 1 - i) * step));
    return `${d.getUTCDate()} ${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}`;
  });
}

export interface Preview {
  tabs: string[];
  donut: { title: string; centre: string; a: string; b: string; totalLabel: string; total: number; pct: number };
  trend: { title: string; labels: string[]; series: { name: string; color: string; values: number[]; dashed?: boolean }[] };
  breakdown: { title: string; rows: { label: string; pct: number; color: string }[] };
  heat: { title: string; seed: number };
  floors: { label: string; pct: number }[];
  departments: { label: string; pct: number }[];
  unit: string;
}
export function previewFor(r: Report, p: PreviewParams): Preview {
  const t = TPL[r.category] ?? TPL['Facilities'];
  const exact = r.name === 'Space Utilization Report' && p.site === 'Head Office' && p.range === 'Last 30 Days' && p.department === 'All Departments' && p.spaceType === 'All Space Types';
  const seed = hash(r.id + p.site + p.range + p.department + p.floor + p.building + p.spaceType);
  const R = rnd(seed);
  const f = SITE_F[p.site] ?? 1;
  const pct = exact ? 68 : Math.max(35, Math.min(99, t.donut[6] + Math.round((R() - 0.5) * 10)));
  const total = Math.round(t.donut[5] * f * (p.floor !== 'All Floors' ? 0.18 : 1) * (p.department !== 'All Departments' ? 0.16 : 1));
  const labels = trendLabels(p.range);
  const base = r.category === 'Facilities' ? [62, 55, 38] : [70, 22, 14];
  const exactVals = [
    [80, 52, 70, 46, 68, 50, 72, 56, 76, 48, 66, 52, 74, 58, 70, 50, 78, 54],
    [66, 42, 60, 36, 58, 44, 62, 40, 64, 46, 60, 38, 64, 44, 58, 42, 66, 46],
    [44, 18, 40, 22, 38, 16, 46, 20, 42, 18, 40, 24, 46, 20, 44, 18, 42, 22],
  ];
  const colors = ['#2563eb', '#7c3aed', '#10b981'];
  const series = t.trend[1].map((name, si) => ({
    name,
    color: colors[si],
    values: exact ? exactVals[si] : labels.map((_, i) => Math.max(4, Math.min(98, Math.round(base[si] + (i % 2 ? -12 : 10) + (R() - 0.5) * 18)))),
  }));
  if (p.compare) series.push({ name: 'Previous Period', color: '#94a3b8', values: series[0].values.map((v) => Math.max(3, v - 6 + Math.round(R() * 8))), dashed: true } as never);
  const rows = t.breakdown[1].map((label, i) => ({ label, pct: exact || r.category === 'Facilities' ? Math.max(10, Math.min(99, SPACE_PCTS[i] + (exact ? 0 : Math.round((R() - 0.5) * 12)))) : Math.round(30 + R() * 65), color: BREAK_COLORS[i] }));
  const floors = ['Ground', 'Floor 1', 'Floor 2', 'Floor 3', 'Floor 4', 'Floor 5', 'Floor 6'].map((label) => ({ label, pct: Math.round(40 + R() * 50) }));
  const departments = DEPARTMENTS.map((label) => ({ label, pct: Math.round(35 + R() * 60) }));
  const where = p.site === 'All Sites' ? 'All Sites' : `${p.site} - ${p.floor === 'All Floors' ? 'Floor 5' : p.floor}`;
  return {
    tabs: t.tabs,
    donut: { title: t.donut[0], centre: t.donut[1], a: t.donut[2], b: t.donut[3], totalLabel: t.donut[4], total, pct },
    trend: { title: t.trend[0], labels, series },
    breakdown: { title: t.breakdown[0], rows },
    heat: { title: `${t.heat} (${where})`, seed: exact ? 0 : seed },
    floors,
    departments,
    unit: t.unit,
  };
}

/* ---------------- Schedules, exports, shares, audit ---------------- */
export interface Schedule {
  id: string;
  reportId: string;
  frequency: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly';
  time: string;
  day: string;
  format: 'PDF' | 'Excel' | 'CSV';
  recipients: string[];
  next: string; // ISO datetime
  lastStatus: 'Delivered' | 'Failed' | 'Pending';
  active: boolean;
  owner: string;
}
const FREQ: Schedule['frequency'][] = ['Daily', 'Weekly', 'Monthly', 'Daily', 'Weekly', 'Quarterly'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const RECIP = ['hr-team@people360.com', 'facilities@people360.com', 'security-ops@people360.com', 'leadership@people360.com', 'site-managers@people360.com', 'payroll@people360.com'];
function buildSchedules(): Schedule[] {
  const R = rnd(4242);
  const picks = REPORTS.filter((_, i) => i % 4 === 0).slice(0, 36);
  return picks.map((r, i) => {
    const freq = FREQ[i % FREQ.length];
    const d = new Date(Date.UTC(2026, 9, 14 + (i % 4 === 0 ? 0 : (i % 6) + 1)));
    const hh = [6, 7, 8, 9, 17, 18][i % 6];
    return {
      id: `SCH-${String(201 + i)}`,
      reportId: r.id,
      frequency: freq,
      time: `${String(hh).padStart(2, '0')}:00`,
      day: freq === 'Weekly' ? DAYS[i % 5] : freq === 'Daily' ? 'Every day' : freq === 'Monthly' ? '1st of month' : '1st of quarter',
      format: (['PDF', 'Excel', 'CSV'] as const)[i % 3],
      recipients: [RECIP[i % RECIP.length], ...(i % 3 === 0 ? [RECIP[(i + 2) % RECIP.length]] : [])],
      next: `${d.toISOString().slice(0, 10)}T${String(hh).padStart(2, '0')}:00`,
      lastStatus: i === 5 || i === 22 ? 'Failed' : R() < 0.08 ? 'Pending' : 'Delivered',
      active: i % 9 !== 4,
      owner: i % 3 ? AUTHORS[i % AUTHORS.length] : 'System',
    };
  });
}

export interface ExportJob {
  id: string;
  dataset: string;
  format: string;
  rows: number;
  size: string;
  by: string;
  at: string; // ISO datetime
  status: 'Completed' | 'Failed' | 'Processing';
}
export interface Share {
  id: string;
  reportId: string;
  with: string;
  kind: 'User' | 'Role' | 'Link' | 'External';
  permission: 'View' | 'Run' | 'Edit';
  by: string;
  at: string;
  expires: string;
  views: number;
  active: boolean;
}
export interface AuditEvent {
  id: number;
  at: string; // ISO datetime
  user: string;
  action: 'Run' | 'Export' | 'Share' | 'Schedule' | 'Edit' | 'Create' | 'Delete' | 'View' | 'Permission' | 'Revoke';
  target: string;
  detail: string;
  ip: string;
  channel: 'Web' | 'Mobile' | 'API' | 'Scheduler';
  result: 'Success' | 'Failed' | 'Denied';
}
const ACTIONS: AuditEvent['action'][] = ['Run', 'Run', 'Run', 'View', 'View', 'Export', 'Export', 'Share', 'Schedule', 'Edit', 'Create', 'Permission', 'Delete', 'Revoke'];
const PEOPLE = AUTHORS.filter((a) => a !== ME).concat(['Fatima Zahra', 'Ken Watanabe', 'Grace Liu', 'Mohammed Saleh']);
function buildAudit(): AuditEvent[] {
  const R = rnd(777);
  const out: AuditEvent[] = [];
  const start = Date.UTC(2026, 9, 14, 10, 20);
  for (let i = 0; i < 640; i++) {
    const at = new Date(start - Math.round(i * (14 * 24 * 60 / 640) + R() * 8) * 60000);
    const action = ACTIONS[Math.floor(R() * ACTIONS.length)];
    const rep = REPORTS[Math.floor(R() * REPORTS.length)];
    const user = action === 'Run' && R() < 0.2 ? 'Scheduler' : PEOPLE[Math.floor(R() * PEOPLE.length)];
    const fail = R();
    out.push({
      id: 100000 - i,
      at: at.toISOString().slice(0, 16),
      user,
      action,
      target: rep.name,
      detail: {
        Run: `Generated with Site=${SITES[i % 6]}, Range=Last 30 Days`,
        View: 'Opened report preview',
        Export: `Exported as ${['PDF', 'Excel', 'CSV'][i % 3]} (${200 + (i * 37) % 4800} rows)`,
        Share: `Shared with ${ROLES[i % ROLES.length]} (View)`,
        Schedule: `Schedule set to ${FREQ[i % 4]} at 0${6 + (i % 4)}:00`,
        Edit: 'Updated filters and columns',
        Create: 'Created from Custom Report Builder',
        Permission: `Granted Run access to ${ROLES[(i + 2) % ROLES.length]}`,
        Delete: 'Removed old version v' + (1 + (i % 4)),
        Revoke: 'Revoked public link',
      }[action],
      ip: `10.${12 + (i % 4)}.${(i * 7) % 255}.${(i * 13) % 250}`,
      channel: user === 'Scheduler' ? 'Scheduler' : (['Web', 'Web', 'Web', 'Mobile', 'API'] as const)[i % 5],
      result: action === 'Permission' && fail < 0.15 ? 'Denied' : fail < 0.04 ? 'Failed' : 'Success',
    });
  }
  return out;
}

export const DATASETS = [
  { id: 'employees', name: 'Employees', module: 'People & Identity', icon: 'users', color: '#7c3aed', records: 12480 },
  { id: 'attendance', name: 'Attendance Records', module: 'Time & Attendance', icon: 'calendar-days', color: '#3b82f6', records: 268420 },
  { id: 'access', name: 'Access Events', module: 'Physical Access Control', icon: 'shield', color: '#0ea5e9', records: 1284600 },
  { id: 'visitors', name: 'Visitor Log', module: 'Visitor Management', icon: 'user-plus', color: '#22c55e', records: 48210 },
  { id: 'spaces', name: 'Space Bookings', module: 'Digital Twin & Spatial', icon: 'building', color: '#a855f7', records: 92840 },
  { id: 'leave', name: 'Leave Applications', module: 'Leave & Absence', icon: 'calendar-x', color: '#f59e0b', records: 22610 },
  { id: 'training', name: 'Training Records', module: 'Training, Skills & Compliance', icon: 'graduation-cap', color: '#10b981', records: 24360 },
  { id: 'incidents', name: 'Safety Incidents', module: 'Workplace Safety', icon: 'triangle-alert', color: '#ef4444', records: 1862 },
  { id: 'meals', name: 'Meal Transactions', module: 'Meal & Canteen', icon: 'utensils', color: '#f97316', records: 158300 },
];

function buildExports(): ExportJob[] {
  const R = rnd(99);
  return Array.from({ length: 40 }, (_, i) => {
    const ds = DATASETS[i % DATASETS.length];
    const rows = Math.round(500 + R() * 24000);
    const at = new Date(Date.UTC(2026, 9, 14, 9, 50) - i * 7.3 * 3600000);
    return { id: `EXP-${5428 - i}`, dataset: ds.name, format: ['CSV', 'Excel', 'CSV', 'JSON', 'PDF'][i % 5], rows, size: `${(rows * 0.21 / 1024).toFixed(1)} MB`, by: PEOPLE[i % PEOPLE.length], at: at.toISOString().slice(0, 16), status: i === 3 || i === 17 ? 'Failed' : 'Completed' };
  });
}
function buildShares(): Share[] {
  return REPORTS.filter((_, i) => i % 5 === 0).slice(0, 24).map((r, i) => ({
    id: `SHR-${301 + i}`,
    reportId: r.id,
    with: i % 4 === 0 ? ROLES[i % ROLES.length] : i % 4 === 1 ? 'Public link' : i % 4 === 2 ? PEOPLE[i % PEOPLE.length] : `auditor${i}@external-audit.com`,
    kind: (['Role', 'Link', 'User', 'External'] as const)[i % 4],
    permission: (['View', 'Run', 'View', 'Edit'] as const)[i % 4],
    by: AUTHORS[i % AUTHORS.length],
    at: `2026-${i < 12 ? '10' : '09'}-${String(1 + ((i * 3) % 28)).padStart(2, '0')}`,
    expires: i % 4 === 1 || i % 4 === 3 ? `2026-${i % 3 ? '11' : '10'}-${String(5 + (i % 20)).padStart(2, '0')}` : 'Never',
    views: 4 + ((i * 17) % 90),
    active: i % 7 !== 6,
  }));
}

/** Access matrix: role → category → permission level 0 none, 1 view, 2 run, 3 edit, 4 manage. */
function buildMatrix(): Record<string, Record<string, number>> {
  const m: Record<string, Record<string, number>> = {};
  ROLES.forEach((role, ri) => {
    m[role] = {};
    CATEGORIES.forEach((c, ci) => {
      m[role][c] = ri === 0 ? 4 : ri === 6 ? (ci < 2 ? 1 : 0) : Math.max(0, 3 - ((ri + ci) % 4));
    });
  });
  m['HR Manager']['Attendance'] = 4;
  m['HR Manager']['Leave'] = 4;
  m['Facility Manager']['Facilities'] = 4;
  m['Security Manager']['Security'] = 4;
  return m;
}
export const PERM_LEVELS = ['No Access', 'View', 'Run', 'Edit', 'Manage'];

/* ---------------- Dashboards ---------------- */
export interface Widget {
  id: string;
  kind: 'kpi' | 'line' | 'column' | 'donut' | 'bars' | 'heat';
  title: string;
  span: number; // of 12
  source: string; // category
}
export interface Dash {
  id: string;
  name: string;
  owner: string;
  shared: boolean;
  isDefault: boolean;
  updated: string;
  views: number;
  color: string;
  widgets: Widget[];
}
export const WIDGET_LIBRARY: Omit<Widget, 'id'>[] = [
  { kind: 'kpi', title: 'Attendance Rate', span: 3, source: 'Attendance' },
  { kind: 'kpi', title: 'Space Utilization', span: 3, source: 'Facilities' },
  { kind: 'kpi', title: 'Visitors Today', span: 3, source: 'Visitors' },
  { kind: 'kpi', title: 'Open Incidents', span: 3, source: 'Safety' },
  { kind: 'kpi', title: 'Training Compliance', span: 3, source: 'Training' },
  { kind: 'kpi', title: 'Access Denials', span: 3, source: 'Security' },
  { kind: 'line', title: 'Attendance Trend', span: 6, source: 'Attendance' },
  { kind: 'column', title: 'Space Utilization Trend', span: 6, source: 'Facilities' },
  { kind: 'donut', title: 'Leave by Type', span: 4, source: 'Leave' },
  { kind: 'bars', title: 'Utilization by Space Type', span: 4, source: 'Facilities' },
  { kind: 'heat', title: 'Access Events by Hour', span: 8, source: 'Security' },
  { kind: 'column', title: 'Visitor Trend', span: 6, source: 'Visitors' },
  { kind: 'donut', title: 'Incident Closure', span: 4, source: 'Safety' },
  { kind: 'bars', title: 'Training by Course', span: 4, source: 'Training' },
  { kind: 'line', title: 'Meal Consumption Trend', span: 6, source: 'Canteen' },
];
const W = (ids: number[]) => ids.map((i, k) => ({ ...WIDGET_LIBRARY[i], id: `w${i}-${k}` }));
function buildDashboards(): Dash[] {
  return [
    { id: 'D1', name: 'Executive People Overview', owner: 'System', shared: true, isDefault: true, updated: '2026-10-12', views: 1284, color: '#7c3aed', widgets: W([0, 1, 2, 3, 6, 7, 8, 9, 10]) },
    { id: 'D2', name: 'Facilities & Space', owner: 'Priya Nair', shared: true, isDefault: false, updated: '2026-10-09', views: 642, color: '#a855f7', widgets: W([1, 2, 7, 9, 10]) },
    { id: 'D3', name: 'HR Attendance & Leave', owner: 'Sara Khan', shared: true, isDefault: false, updated: '2026-10-11', views: 905, color: '#3b82f6', widgets: W([0, 4, 6, 8, 13]) },
    { id: 'D4', name: 'Security Operations', owner: 'Omar Haddad', shared: true, isDefault: false, updated: '2026-10-08', views: 588, color: '#0ea5e9', widgets: W([5, 3, 2, 10, 12, 11]) },
    { id: 'D5', name: 'Safety & Compliance', owner: 'Aisha Rahman', shared: false, isDefault: false, updated: '2026-10-02', views: 214, color: '#ef4444', widgets: W([3, 4, 12, 13, 6]) },
    { id: 'D6', name: 'My Weekly Snapshot', owner: ME, shared: false, isDefault: false, updated: '2026-10-13', views: 57, color: '#22c55e', widgets: W([0, 1, 14, 8]) },
  ];
}

/* ---------------- Store ---------------- */
@Injectable({ providedIn: 'root' })
export class ReportsStore {
  readonly reports = signal<Report[]>(REPORTS.map((r) => ({ ...r })));
  readonly schedules = signal<Schedule[]>(buildSchedules());
  readonly exports = signal<ExportJob[]>(buildExports());
  readonly shares = signal<Share[]>(buildShares());
  readonly audit = signal<AuditEvent[]>(buildAudit());
  readonly matrix = signal(buildMatrix());
  readonly dashboards = signal<Dash[]>(buildDashboards());
  /** Report the library opens on (set by other pages before navigating). */
  readonly focusId = signal<string | null>(null);
  /** Exports this month: 428 baseline + exports done in this session. */
  readonly exportsThisMonth = signal(428);

  readonly runsThisMonth = computed(() => this.reports().reduce((a, r) => a + r.runs, 0));
  readonly activeSchedules = computed(() => this.schedules().filter((s) => s.active).length);
  readonly byId = computed(() => new Map(this.reports().map((r) => [r.id, r])));

  private nextAudit = 100001;
  private now() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${TODAY}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  log(action: AuditEvent['action'], target: string, detail: string, result: AuditEvent['result'] = 'Success') {
    this.audit.update((l) => [{ id: this.nextAudit++, at: this.now(), user: ME, action, target, detail, ip: '10.12.4.21', channel: 'Web', result }, ...l]);
  }
  run(r: Report, detail = 'Generated with default parameters') {
    this.reports.update((l) => l.map((x) => (x.id === r.id ? { ...x, runs: x.runs + 1, lastRun: this.now() } : x)));
    this.log('Run', r.name, detail);
  }
  toggleFavorite(id: string) {
    this.reports.update((l) => l.map((x) => (x.id === id ? { ...x, favorite: !x.favorite } : x)));
  }
  addReport(r: Omit<Report, 'id' | 'runs' | 'favorite' | 'updated' | 'createdBy'>) {
    const id = `RPT-${1001 + this.reports().length + Math.floor(Math.random() * 50)}`;
    const rep: Report = { ...r, id, runs: 0, favorite: true, updated: TODAY, createdBy: ME };
    this.reports.update((l) => [rep, ...l]);
    this.log('Create', rep.name, `Saved to library under ${rep.category}`);
    return rep;
  }
  updateReport(id: string, ch: Partial<Report>) {
    this.reports.update((l) => l.map((x) => (x.id === id ? { ...x, ...ch, updated: TODAY } : x)));
  }
  deleteReport(id: string) {
    const r = this.byId().get(id);
    this.reports.update((l) => l.filter((x) => x.id !== id));
    if (r) this.log('Delete', r.name, 'Report deleted from library');
  }
  addSchedule(s: Omit<Schedule, 'id' | 'lastStatus' | 'owner'>) {
    const sc: Schedule = { ...s, id: `SCH-${201 + this.schedules().length + Math.floor(Math.random() * 90)}`, lastStatus: 'Pending', owner: ME };
    this.schedules.update((l) => [sc, ...l]);
    this.log('Schedule', this.byId().get(s.reportId)?.name ?? s.reportId, `${s.frequency} at ${s.time} as ${s.format} → ${s.recipients.join(', ')}`);
    return sc;
  }
  patchSchedule(id: string, ch: Partial<Schedule>) {
    this.schedules.update((l) => l.map((s) => (s.id === id ? { ...s, ...ch } : s)));
  }
  addExport(dataset: string, format: string, rows: number) {
    const job: ExportJob = { id: `EXP-${5429 + this.exportsThisMonth() - 428}`, dataset, format, rows, size: `${Math.max(0.1, (rows * 0.21) / 1024).toFixed(1)} MB`, by: ME, at: this.now(), status: 'Completed' };
    this.exports.update((l) => [job, ...l]);
    this.exportsThisMonth.update((n) => n + 1);
    this.log('Export', dataset, `Exported as ${format} (${fmtNum(rows)} rows)`);
    return job;
  }
  addShare(s: Omit<Share, 'id' | 'by' | 'at' | 'views' | 'active'>) {
    const sh: Share = { ...s, id: `SHR-${400 + this.shares().length}`, by: ME, at: TODAY, views: 0, active: true };
    this.shares.update((l) => [sh, ...l]);
    this.log('Share', this.byId().get(s.reportId)?.name ?? s.reportId, `Shared with ${s.with} (${s.permission})`);
    return sh;
  }
  setPerm(role: string, cat: string, level: number) {
    this.matrix.update((m) => ({ ...m, [role]: { ...m[role], [cat]: level } }));
    this.log('Permission', `${cat} reports`, `${role} set to ${PERM_LEVELS[level]}`);
  }
}
