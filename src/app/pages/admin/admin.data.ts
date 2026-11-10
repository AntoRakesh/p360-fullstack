// Administration & Configuration — one tenant dataset shared by every admin page (root store, signals).
import { computed, Injectable, signal } from '@angular/core';
import { MODULES } from '../../modules';

/* ---------------- Types ---------------- */
export interface Org {
  tenantId: string;
  name: string;
  shortName: string;
  tenantType: string;
  industry: string;
  website: string;
  email: string;
  address: string;
  country: string;
  timeZone: string;
  language: string;
  logo: string | null;
}
export interface BusinessUnit { id: string; name: string; code: string; country: string; flag: string; head: string; status: 'Active' | 'Inactive'; created: string; color: string; }
export interface Site {
  id: string; name: string; buId: string; city: string; type: 'Head Office' | 'Office' | 'Warehouse' | 'Plant' | 'Data Center' | 'Field Site';
  address: string; floors: number; capacity: number; manager: string; status: 'Active' | 'Inactive' | 'Commissioning'; lon: number; lat: number; zones: number; devices: number;
}
export interface Team { id: string; name: string; lead: string; members: number; shift: string; }
export interface Department { id: string; name: string; siteId: string; head: string; costCenter: string; status: 'Active' | 'Inactive'; teams: Team[]; target: number; }
export interface SubTenant { id: string; name: string; type: string; admin: string; created: string; }
export type Action = 'View' | 'Create' | 'Edit' | 'Delete' | 'Approve' | 'Export';
export interface Role { id: string; name: string; desc: string; type: 'System' | 'Custom'; color: string; scope: 'Tenant' | 'Business Unit' | 'Site' | 'Department' | 'Self'; perms: Record<string, Action[]>; }
export interface AppUser {
  id: string; name: string; initials: string; avatar: string; email: string; phone: string; roleId: string; deptId: string; siteId: string; buId: string;
  status: 'Active' | 'Invited' | 'Locked' | 'Disabled'; lastLogin: string; mfa: boolean; sso: boolean; title: string; joined: string;
}
export interface Group { id: string; name: string; desc: string; type: 'Dynamic' | 'Static'; rule: string; members: string[]; roleIds: string[]; owner: string; color: string; created: string; }
export interface AuditEntry {
  id: string; at: number; actor: string; initials: string; color: string; action: string; entity: string; target: string; detail: string;
  category: 'Organization' | 'Users & Roles' | 'Security' | 'Branding' | 'Data & Privacy' | 'Subscription' | 'System' | 'Authentication';
  severity: 'Info' | 'Warning' | 'Critical'; ip: string; before?: string; after?: string;
}
export interface ModuleAccessRow { path: string; enabled: boolean; scope: string[]; beta: boolean; }
export interface Translation { key: string; en: string; ar: string; hi: string; fr: string; }
export interface Dsar { id: string; type: 'Access' | 'Erasure' | 'Rectification' | 'Portability' | 'Restriction'; requester: string; email: string; kind: 'Employee' | 'Visitor' | 'Contractor' | 'Ex-employee'; received: string; due: string; status: 'New' | 'Verifying' | 'In Progress' | 'Completed' | 'Rejected'; assignee: string; systems: string[]; note: string; }
export interface RetentionPolicy { id: string; category: string; module: string; days: number | 'Default'; action: 'Delete' | 'Anonymize' | 'Archive'; records: number; legalHold: boolean; basis: string; }
export interface Invoice { id: string; date: string; period: string; amount: number; status: 'Paid' | 'Due' | 'Overdue'; }

/* ---------------- Helpers ---------------- */
export const ACTIONS: Action[] = ['View', 'Create', 'Edit', 'Delete', 'Approve', 'Export'];
export const AV_COLORS = ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0891b2)', 'var(--ka-16a34a)', 'var(--ka-ea580c)', 'var(--ka-db2777)', 'var(--ka-9333ea)', 'var(--ka-0d9488)', 'var(--ka-4f46e5)', 'var(--ka-ca8a04)'];
export const initialsOf = (n: string) => n.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).slice(0, 2).join('') || n.slice(0, 2).toUpperCase();
export const colorOf = (n: string) => AV_COLORS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');
/** 14 Oct 2026, 09:42 AM */
export function fmtStamp(ms: number) {
  const d = new Date(ms);
  const h = d.getHours() % 12 || 12;
  return `${p2(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}, ${p2(h)}:${p2(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}
export function fmtDay(iso: string) {
  const d = new Date(iso);
  return `${p2(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}
export const fmtN = (n: number) => n.toLocaleString('en-US');
let seq = 1000;
const nid = (p: string) => `${p}${++seq}`;

/* ---------------- Organization ---------------- */
export const ORG: Org = {
  tenantId: 'TNT-DCS-0001', name: 'DCS Group', shortName: 'DCS', tenantType: 'Customer (Enterprise)', industry: 'Technology & Solutions',
  website: 'https://www.dcs.ae', email: 'admin@dcs.ae', address: 'Office 101, Business Tower, Dubai, UAE', country: 'United Arab Emirates',
  timeZone: '(GMT+04:00) Dubai', language: 'English (US)', logo: null,
};
export const TENANT_TYPES = ['Customer (Enterprise)', 'Customer (SMB)', 'Partner / Reseller', 'Internal', 'Trial'];
export const INDUSTRIES = ['Technology & Solutions', 'Facilities Management', 'Manufacturing', 'Logistics & Supply Chain', 'Retail', 'Healthcare', 'Government', 'Hospitality', 'Oil & Gas', 'Education'];
export const COUNTRIES = ['United Arab Emirates', 'Kuwait', 'Oman', 'Bahrain', 'Qatar', 'Saudi Arabia', 'India', 'United Kingdom'];
export const TIME_ZONES = ['(GMT+04:00) Dubai', '(GMT+03:00) Kuwait', '(GMT+04:00) Muscat', '(GMT+03:00) Bahrain', '(GMT+03:00) Doha', '(GMT+03:00) Riyadh', '(GMT+05:30) Kolkata', '(GMT+00:00) London'];
export const LANGUAGES = ['English (US)', 'English (UK)', 'Arabic', 'Hindi', 'French'];
export const CURRENCIES = ['AED - UAE Dirham', 'KWD - Kuwaiti Dinar', 'OMR - Omani Rial', 'BHD - Bahraini Dinar', 'QAR - Qatari Riyal', 'SAR - Saudi Riyal', 'USD - US Dollar', 'EUR - Euro'];
export const RETENTION_OPTIONS = [90, 180, 365, 730, 1095, 2555];

export const BUS: BusinessUnit[] = [
  { id: 'bu-uae', name: 'UAE Business Unit', code: 'BU-UAE', country: 'United Arab Emirates', flag: '🇦🇪', head: 'Khalid Al Mansoori', status: 'Active', created: '2024-02-01', color: 'var(--ka-7c3aed)' },
  { id: 'bu-kw', name: 'Kuwait Business Unit', code: 'BU-KWT', country: 'Kuwait', flag: '🇰🇼', head: 'Faisal Al Sabah', status: 'Active', created: '2024-06-15', color: 'var(--ka-2563eb)' },
  { id: 'bu-om', name: 'Oman Business Unit', code: 'BU-OMN', country: 'Oman', flag: '🇴🇲', head: 'Said Al Busaidi', status: 'Active', created: '2024-09-01', color: 'var(--ka-16a34a)' },
  { id: 'bu-bh', name: 'Bahrain Business Unit', code: 'BU-BHR', country: 'Bahrain', flag: '🇧🇭', head: 'Hamad Al Khalifa', status: 'Active', created: '2025-01-10', color: 'var(--ka-ea580c)' },
  { id: 'bu-qa', name: 'Qatar Business Unit', code: 'BU-QAT', country: 'Qatar', flag: '🇶🇦', head: 'Tamim Al Thani', status: 'Active', created: '2025-04-20', color: 'var(--ka-db2777)' },
];

const S = (id: string, name: string, buId: string, city: string, type: Site['type'], lon: number, lat: number, floors: number, capacity: number, manager: string, address: string): Site => ({
  id, name, buId, city, type, lon, lat, floors, capacity, manager, address, status: 'Active', zones: floors * 4 + 2, devices: Math.round(capacity / 9),
});
export const SITES: Site[] = [
  S('s-hq', 'Head Office', 'bu-uae', 'Dubai', 'Head Office', 55.27, 25.2, 12, 820, 'Rex Kumar', 'Office 101, Business Tower, Sheikh Zayed Rd, Dubai'),
  S('s-dxb', 'Dubai Office', 'bu-uae', 'Dubai', 'Office', 55.14, 25.07, 4, 260, 'Sara Ahmed', 'Dubai Internet City, Building 9, Dubai'),
  S('s-auh', 'Abu Dhabi Office', 'bu-uae', 'Abu Dhabi', 'Office', 54.37, 24.47, 3, 140, 'Omar Khalid', 'Al Maryah Island, ADGM Square, Abu Dhabi'),
  S('s-shj', 'Sharjah Office', 'bu-uae', 'Sharjah', 'Warehouse', 55.42, 25.33, 2, 180, 'Imran Qureshi', 'Industrial Area 13, Sharjah'),
  S('s-kwc', 'Kuwait City HQ', 'bu-kw', 'Kuwait City', 'Office', 47.98, 29.37, 6, 160, 'Faisal Al Sabah', 'Al Hamra Tower, Floor 31, Kuwait City'),
  S('s-shw', 'Shuwaikh Warehouse', 'bu-kw', 'Shuwaikh', 'Warehouse', 47.92, 29.34, 1, 120, 'Yousef Haddad', 'Shuwaikh Industrial Area, Block 2'),
  S('s-ahm', 'Ahmadi Field Site', 'bu-kw', 'Ahmadi', 'Field Site', 48.08, 29.08, 1, 90, 'Ali Hassan', 'Ahmadi Industrial Zone, Plot 44'),
  S('s-kdc', 'Kuwait Data Center', 'bu-kw', 'Kuwait City', 'Data Center', 47.99, 29.27, 2, 40, 'Vikram Mehta', 'Sabhan Industrial Area, Kuwait'),
  S('s-mct', 'Muscat Office', 'bu-om', 'Muscat', 'Office', 58.41, 23.59, 5, 120, 'Said Al Busaidi', 'Muscat Grand Mall Tower, Al Khuwair'),
  S('s-soh', 'Sohar Plant', 'bu-om', 'Sohar', 'Plant', 56.75, 24.36, 2, 160, 'Arjun Nair', 'Sohar Industrial Port, Plot 7'),
  S('s-sll', 'Salalah Depot', 'bu-om', 'Salalah', 'Warehouse', 54.09, 17.02, 1, 60, 'Hassan Rahman', 'Raysut Industrial Estate, Salalah'),
  S('s-dqm', 'Duqm Site', 'bu-om', 'Duqm', 'Field Site', 57.7, 19.66, 1, 50, 'Tariq Saleh', 'Special Economic Zone, Duqm'),
  S('s-mnm', 'Manama Office', 'bu-bh', 'Manama', 'Office', 50.58, 26.23, 4, 90, 'Hamad Al Khalifa', 'Bahrain Financial Harbour, West Tower'),
  S('s-str', 'Sitra Warehouse', 'bu-bh', 'Sitra', 'Warehouse', 50.63, 26.15, 1, 50, 'Grace Thomas', 'Sitra Industrial Area, Block 6'),
  S('s-doh', 'Doha Office', 'bu-qa', 'Doha', 'Office', 51.53, 25.29, 5, 70, 'Tamim Al Thani', 'West Bay, Tornado Tower, Doha'),
  S('s-lus', 'Lusail Tower', 'bu-qa', 'Lusail', 'Office', 51.52, 25.42, 3, 40, 'Lina Saleh', 'Marina District, Lusail'),
  S('s-rlf', 'Ras Laffan Site', 'bu-qa', 'Ras Laffan', 'Field Site', 51.55, 25.9, 1, 40, 'Kevin Fernandes', 'Ras Laffan Industrial City'),
  S('s-msd', 'Mesaieed Plant', 'bu-qa', 'Mesaieed', 'Plant', 51.55, 24.99, 1, 30, 'Carlos Mathew', 'Mesaieed Industrial City'),
];
SITES[2].status = 'Active';
SITES[11].status = 'Commissioning';

const D = (id: string, name: string, siteId: string, head: string, target: number, teams: [string, string][]): Department => ({
  id, name, siteId, head, target, costCenter: `CC-${id.slice(2).toUpperCase()}`, status: 'Active',
  teams: teams.map(([t, lead], i) => ({ id: `${id}-t${i}`, name: t, lead, members: 0, shift: i % 3 === 2 ? 'Night' : i % 2 ? 'Day B' : 'Day A' })),
});
export const DEPARTMENTS: Department[] = [
  D('d-it', 'IT Department', 's-hq', 'Vikram Mehta', 64, [['Infrastructure', 'Arjun Nair'], ['Applications', 'Priya Nair'], ['Service Desk', 'Daniel Smith'], ['Cyber Security', 'Imran Khan']]),
  D('d-hr', 'HR Department', 's-hq', 'Aisha Al Hashimi', 38, [['Talent Acquisition', 'Mariam Saleh'], ['People Operations', 'Noura Ahmed'], ['Learning & Development', 'Emily Thomas']]),
  D('d-ops', 'Operations', 's-hq', 'Khalid Al Mansoori', 142, [['Command Center', 'Omar Khalid'], ['Field Operations', 'Ali Hassan'], ['Shift Control', 'Yousef Haddad'], ['Quality', 'Hana Rahman']]),
  D('d-fin', 'Finance', 's-hq', 'Rajesh Kumar', 46, [['Accounts Payable', 'Meera Sharma'], ['Payroll', 'Sophia Fernandes'], ['Audit & Controls', 'Michael Patel']]),
  D('d-fac', 'Facilities', 's-hq', 'Imran Qureshi', 58, [['Maintenance', 'Hassan Ibrahim'], ['Security', 'Tariq Saleh'], ['Housekeeping', 'Grace Mathew']]),
  D('d-sal', 'Sales', 's-dxb', 'Sara Ahmed', 72, [['Enterprise Sales', 'John Smith'], ['Inside Sales', 'Layla Hassan'], ['Partnerships', 'Carlos Fernandes']]),
  D('d-cs', 'Customer Service', 's-dxb', 'Reem Al Zaabi', 54, [['Contact Center', 'Zainab Khan'], ['Customer Success', 'Kevin Thomas']]),
  D('d-mkt', 'Marketing', 's-dxb', 'Anjali Mehta', 28, [['Brand & Content', 'Maria Fernandes'], ['Digital', 'Daniel Mathew']]),
  D('d-gov', 'Government Relations', 's-auh', 'Mohammed Al Hashimi', 18, [['PRO Services', 'Ahmed Saleh']]),
  D('d-prj', 'Projects', 's-auh', 'Omar Khalid', 44, [['PMO', 'Fatima Ibrahim'], ['Delivery', 'Arjun Sharma']]),
  D('d-log', 'Logistics', 's-shj', 'Imran Rahman', 66, [['Inbound', 'Ali Qureshi'], ['Outbound', 'Faisal Khan'], ['Fleet', 'Hassan Patel']]),
  D('d-prc', 'Procurement', 's-shj', 'Meera Nair', 24, [['Sourcing', 'Priya Kumar']]),
  D('d-okw', 'Operations - KW', 's-kwc', 'Faisal Al Sabah', 62, [['Site Operations', 'Yousef Ahmed'], ['Client Services', 'Noura Hassan']]),
  D('d-wkw', 'Warehouse - KW', 's-shw', 'Yousef Haddad', 48, [['Receiving', 'Ali Saleh'], ['Dispatch', 'Omar Rahman']]),
  D('d-fkw', 'Field Services - KW', 's-ahm', 'Ali Hassan', 40, [['Field Crew A', 'Tariq Khan'], ['Field Crew B', 'Hassan Saleh']]),
  D('d-ikw', 'IT Infrastructure - KW', 's-kdc', 'Vikram Mehta', 22, [['DC Operations', 'Daniel Kumar']]),
  D('d-oom', 'Operations - OM', 's-mct', 'Said Al Busaidi', 52, [['Site Operations', 'Khalid Saleh'], ['Admin', 'Mariam Al Zaabi']]),
  D('d-som', 'Sales - OM', 's-mct', 'Lina Haddad', 26, [['Key Accounts', 'Kevin Mathew']]),
  D('d-mom', 'Manufacturing - OM', 's-soh', 'Arjun Nair', 88, [['Line 1', 'Imran Ahmed'], ['Line 2', 'Rajesh Sharma'], ['QA/QC', 'Hana Patel']]),
  D('d-lom', 'Logistics - OM', 's-sll', 'Hassan Rahman', 34, [['Port Logistics', 'Ali Ibrahim']]),
  D('d-xom', 'Maintenance - OM', 's-dqm', 'Tariq Saleh', 30, [['Mechanical', 'Carlos Kumar'], ['Electrical', 'John Mathew']]),
  D('d-obh', 'Operations - BH', 's-mnm', 'Hamad Al Khalifa', 38, [['Site Operations', 'Reem Hassan']]),
  D('d-sbh', 'Sales - BH', 's-mnm', 'Sophia Thomas', 18, [['Sales', 'Daniel Haddad']]),
  D('d-wbh', 'Warehouse - BH', 's-str', 'Grace Thomas', 30, [['Warehouse Ops', 'Faisal Saleh']]),
  D('d-oqa', 'Operations - QA', 's-doh', 'Tamim Al Thani', 40, [['Site Operations', 'Ahmed Khan'], ['Client Services', 'Aisha Rahman']]),
  D('d-sqa', 'Sales - QA', 's-lus', 'Lina Saleh', 22, [['Sales', 'Michael Fernandes']]),
  D('d-fqa', 'Field Services - QA', 's-rlf', 'Kevin Fernandes', 26, [['Field Crew', 'Hassan Khan']]),
  D('d-xqa', 'Security - QA', 's-msd', 'Carlos Mathew', 18, [['Guard Force', 'Omar Saleh']]),
];

/* ---------------- Roles & permissions ---------------- */
export const MODULE_LIST = MODULES.map((m) => ({ path: m.path, title: m.title, icon: m.icon, no: m.no, subs: m.children?.length ?? 0 }));
const ALL = MODULE_LIST.map((m) => m.path);
const lvl = (paths: string[], acts: Action[]) => Object.fromEntries(paths.map((p) => [p, [...acts]])) as Record<string, Action[]>;
const merge = (...xs: Record<string, Action[]>[]) => xs.reduce((a, x) => ({ ...a, ...x }), {} as Record<string, Action[]>);
const FULL: Action[] = [...ACTIONS];
const MANAGE: Action[] = ['View', 'Create', 'Edit', 'Approve', 'Export'];
const VIEW: Action[] = ['View'];
const SELF = ['command-center', 'employee-self-service', 'leave-absence', 'time-attendance', 'training-skills-compliance', 'meal-canteen-management', 'workplace-facility-services'];
const SECURITY = ['physical-access-control', 'visitor-management', 'contractor-vendor', 'real-time-location', 'emergency-mustering', 'safety-wellbeing', 'patrol-guard-management', 'device-edge-management'];
const PEOPLE = ['people-identity', 'time-attendance', 'shift-workforce', 'leave-absence', 'employee-self-service', 'manager-self-service', 'training-skills-compliance', 'ai-people-intelligence'];

export const ROLES: Role[] = [
  { id: 'r-super', name: 'Super Admin', desc: 'Unrestricted platform access including tenant, billing and security configuration.', type: 'System', color: 'var(--ka-7c3aed)', scope: 'Tenant', perms: lvl(ALL, FULL) },
  { id: 'r-tenant', name: 'Tenant Admin', desc: 'Manages organization structure, users, roles and module configuration.', type: 'System', color: 'var(--ka-4f46e5)', scope: 'Tenant', perms: merge(lvl(ALL, MANAGE), lvl(['administration-configuration', 'people-identity'], FULL)) },
  { id: 'r-site', name: 'Site Admin', desc: 'Administers a single site: devices, zones, access and local users.', type: 'System', color: 'var(--ka-2563eb)', scope: 'Site', perms: merge(lvl(ALL, VIEW), lvl(SECURITY, MANAGE), lvl(['command-center', 'reports-analytics'], ['View', 'Export'])) },
  { id: 'r-hr', name: 'HR Manager', desc: 'People, attendance, leave and training administration.', type: 'Custom', color: 'var(--ka-db2777)', scope: 'Business Unit', perms: merge(lvl(['command-center', 'reports-analytics'], ['View', 'Export']), lvl(PEOPLE, MANAGE), lvl(['people-identity'], FULL)) },
  { id: 'r-sec', name: 'Security Manager', desc: 'Access control, visitors, patrols and emergency response.', type: 'Custom', color: 'var(--ka-dc2626)', scope: 'Business Unit', perms: merge(lvl(['command-center', 'reports-analytics', 'digital-twin'], ['View', 'Export']), lvl(SECURITY, FULL)) },
  { id: 'r-dept', name: 'Department Head', desc: 'Approves leave, shifts and tasks for their department.', type: 'Custom', color: 'var(--ka-ea580c)', scope: 'Department', perms: merge(lvl(SELF, ['View', 'Create']), lvl(['manager-self-service', 'shift-workforce', 'tasks-workforce-operations', 'leave-absence'], ['View', 'Create', 'Edit', 'Approve']), lvl(['reports-analytics'], ['View', 'Export'])) },
  { id: 'r-sup', name: 'Supervisor', desc: 'Day-to-day team supervision, rosters and task assignment.', type: 'Custom', color: 'var(--ka-ca8a04)', scope: 'Department', perms: merge(lvl(SELF, ['View', 'Create']), lvl(['shift-workforce', 'tasks-workforce-operations', 'manager-self-service'], ['View', 'Create', 'Edit'])) },
  { id: 'r-rec', name: 'Receptionist', desc: 'Visitor check-in, badges and front-desk operations.', type: 'Custom', color: 'var(--ka-0891b2)', scope: 'Site', perms: merge(lvl(SELF, VIEW), lvl(['visitor-management'], ['View', 'Create', 'Edit', 'Approve']), lvl(['contractor-vendor'], VIEW)) },
  { id: 'r-guard', name: 'Security Guard', desc: 'Patrol tours, incident reporting and alarm response.', type: 'Custom', color: 'var(--ka-475569)', scope: 'Site', perms: merge(lvl(SELF, VIEW), lvl(['patrol-guard-management', 'emergency-mustering', 'safety-wellbeing'], ['View', 'Create', 'Edit']), lvl(['physical-access-control', 'visitor-management'], VIEW)) },
  { id: 'r-aud', name: 'Auditor', desc: 'Read-only access to every module plus export of reports and logs.', type: 'System', color: 'var(--ka-0d9488)', scope: 'Tenant', perms: lvl(ALL, ['View', 'Export']) },
  { id: 'r-emp', name: 'Employee', desc: 'Self-service: attendance, leave, meals, bookings and training.', type: 'System', color: 'var(--ka-16a34a)', scope: 'Self', perms: merge(lvl(SELF, ['View', 'Create'])) },
];

/* ---------------- Users ---------------- */
const FIRST = ['Ahmed', 'Fatima', 'Mohammed', 'Aisha', 'Omar', 'Mariam', 'Ali', 'Noura', 'Khalid', 'Sara', 'Yousef', 'Layla', 'Hassan', 'Reem', 'Rajesh', 'Priya', 'Arjun', 'Anjali', 'John', 'Emily', 'Michael', 'Sophia', 'Daniel', 'Grace', 'Imran', 'Ayesha', 'Faisal', 'Hana', 'Tariq', 'Zainab', 'Vikram', 'Meera', 'Carlos', 'Maria', 'Kevin', 'Lina', 'Saeed', 'Huda', 'Rahul', 'Deepa'];
const LAST = ['Al Mansoori', 'Khan', 'Hassan', 'Nair', 'Kumar', 'Smith', 'Ahmed', 'Al Hashimi', 'Sharma', 'Fernandes', 'Haddad', 'Qureshi', 'Rahman', 'Thomas', 'Al Zaabi', 'Ibrahim', 'Patel', 'Mathew', 'Saleh', 'Mehta', 'Al Suwaidi', 'Menon', 'Joseph', 'Al Marri'];
const TITLES: Record<string, string[]> = {
  'Department Head': ['Head of Department'], 'Site Admin': ['Site Administrator'], 'Super Admin': ['Platform Administrator'], 'Tenant Admin': ['Systems Administrator'],
  'HR Manager': ['HR Manager', 'HR Business Partner'], 'Security Manager': ['Security Manager'], Supervisor: ['Team Supervisor', 'Shift Supervisor'],
  Receptionist: ['Receptionist', 'Front Desk Officer'], 'Security Guard': ['Security Officer', 'Guard'], Auditor: ['Internal Auditor'],
  Employee: ['Specialist', 'Associate', 'Analyst', 'Technician', 'Coordinator', 'Officer', 'Engineer', 'Executive'],
};
function buildUsers(): AppUser[] {
  const out: AppUser[] = [];
  const firstOfSite = new Set<string>();
  let g = 0;
  for (const d of DEPARTMENTS) {
    const site = SITES.find((s) => s.id === d.siteId)!;
    const siteFirst = !firstOfSite.has(site.id);
    firstOfSite.add(site.id);
    for (let j = 0; j < d.target; j++, g++) {
      let role = 'Employee';
      const n = d.name;
      if (j === 0) role = 'Department Head';
      else if (j === 1 && siteFirst) role = 'Site Admin';
      else if (d.id === 'd-it' && j < 4) role = 'Super Admin';
      else if (d.id === 'd-it' && j < 8) role = 'Tenant Admin';
      else if (d.id === 'd-hr' && j < 10) role = 'HR Manager';
      else if (d.id === 'd-fin' && j < 8) role = 'Auditor';
      else if (/Facilities|Security/.test(n) && j === 2) role = 'Security Manager';
      else if (/Facilities|Security|Field|Warehouse/.test(n) && j % 3 === 0) role = 'Security Guard';
      else if (j % 11 === 0) role = 'Supervisor';
      else if (j % 37 === 5) role = 'Receptionist';
      const name = j === 0 ? d.head : j === 1 && siteFirst ? site.manager : `${FIRST[(g * 7 + 3) % FIRST.length]} ${LAST[(g * 5 + Math.floor(g / FIRST.length)) % LAST.length]}`;
      const status: AppUser['status'] = g % 47 === 13 ? 'Invited' : g % 89 === 7 ? 'Locked' : g % 61 === 30 ? 'Disabled' : 'Active';
      const roleId = ROLES.find((r) => r.name === role)!.id;
      const tl = TITLES[role];
      const mins = (g * 37) % 600;
      out.push({
        id: `U${String(g + 1).padStart(4, '0')}`, name, initials: initialsOf(name), avatar: colorOf(name),
        email: `${name.toLowerCase().replace(/[^a-z ]/g, '').replace(/ +/g, '.')}${j > 1 ? (g % 90) : ''}@dcs.ae`,
        phone: `+971 5${g % 6} ${String(1000000 + ((g * 7919) % 8999999)).slice(0, 3)} ${String(1000 + ((g * 31) % 8999))}`,
        roleId, deptId: d.id, siteId: site.id, buId: site.buId, status,
        lastLogin: status === 'Invited' ? '—' : g % 9 === 0 ? `${(g % 6) + 2} days ago` : `Today ${p2(7 + Math.floor(mins / 60))}:${p2(mins % 60)}`,
        mfa: status !== 'Invited' && g % 6 !== 0, sso: g % 4 !== 1, title: `${tl[g % tl.length]}${role === 'Employee' ? ' - ' + n.replace(/ - ..$/, '').replace(' Department', '') : ''}`,
        joined: `20${19 + (g % 7)}-${p2((g % 12) + 1)}-${p2((g % 27) + 1)}`,
      });
    }
  }
  return out;
}
export const USERS = buildUsers();

/* ---------------- Groups ---------------- */
type Rule = { label: string; match: (u: AppUser) => boolean };
const deptName = (id: string) => DEPARTMENTS.find((d) => d.id === id)?.name ?? '';
export const GROUP_RULES: Record<string, Rule> = {
  ops: { label: 'Department name contains "Operations"', match: (u) => deptName(u.deptId).includes('Operations') },
  sec: { label: 'Role is Security Manager or Security Guard', match: (u) => u.roleId === 'r-sec' || u.roleId === 'r-guard' },
  heads: { label: 'Role is Department Head', match: (u) => u.roleId === 'r-dept' },
  sites: { label: 'Role is Site Admin', match: (u) => u.roleId === 'r-site' },
  uae: { label: 'Business unit = UAE Business Unit', match: (u) => u.buId === 'bu-uae' },
  field: { label: 'Department name contains "Field" or "Warehouse"', match: (u) => /Field|Warehouse/.test(deptName(u.deptId)) },
  nomfa: { label: 'MFA not enrolled and status Active', match: (u) => !u.mfa && u.status === 'Active' },
};
const pick = (pred: (u: AppUser, i: number) => boolean) => USERS.filter(pred).map((u) => u.id);
export const GROUPS: Group[] = [
  { id: 'g-ops', name: 'Operations Team', desc: 'All operations staff across business units — receives shift and incident broadcasts.', type: 'Dynamic', rule: 'ops', members: [], roleIds: ['r-sup'], owner: 'Mohammed Tariq', color: 'var(--ka-ef4444)', created: '2026-10-13' },
  { id: 'g-sec', name: 'Security Team', desc: 'Guards and security managers — patrol, alarm and emergency notifications.', type: 'Dynamic', rule: 'sec', members: [], roleIds: ['r-guard'], owner: 'Tariq Saleh', color: 'var(--ka-475569)', created: '2025-03-02' },
  { id: 'g-heads', name: 'Department Heads', desc: 'Approvers for leave, overtime and access requests.', type: 'Dynamic', rule: 'heads', members: [], roleIds: ['r-dept'], owner: 'Aisha Al Hashimi', color: 'var(--ka-ea580c)', created: '2024-02-05' },
  { id: 'g-sites', name: 'Site Administrators', desc: 'Local administrators for each of the 18 sites.', type: 'Dynamic', rule: 'sites', members: [], roleIds: ['r-site'], owner: 'Rex Kumar', color: 'var(--ka-2563eb)', created: '2024-02-05' },
  { id: 'g-uae', name: 'All Staff - UAE', desc: 'Everyone in the UAE business unit.', type: 'Dynamic', rule: 'uae', members: [], roleIds: [], owner: 'Rex Kumar', color: 'var(--ka-7c3aed)', created: '2024-02-05' },
  { id: 'g-field', name: 'Field & Warehouse Crew', desc: 'Lone-worker and PPE policy applies.', type: 'Dynamic', rule: 'field', members: [], roleIds: [], owner: 'Ali Hassan', color: 'var(--ka-ca8a04)', created: '2025-06-18' },
  { id: 'g-nomfa', name: 'MFA Not Enrolled', desc: 'Users who still need to enrol in multi-factor authentication.', type: 'Dynamic', rule: 'nomfa', members: [], roleIds: [], owner: 'Sara Ahmed', color: 'var(--ka-dc2626)', created: '2026-08-01' },
  { id: 'g-it', name: 'IT Admins', desc: 'Platform and infrastructure administrators.', type: 'Static', rule: '', members: pick((u) => u.deptId === 'd-it' && (u.roleId === 'r-super' || u.roleId === 'r-tenant')), roleIds: ['r-tenant'], owner: 'Vikram Mehta', color: 'var(--ka-4f46e5)', created: '2024-02-01' },
  { id: 'g-fin', name: 'Finance Approvers', desc: 'Approve purchase orders, meal subsidies and contractor invoices.', type: 'Static', rule: '', members: pick((u, i) => u.deptId === 'd-fin' && i % 3 === 0), roleIds: [], owner: 'Rajesh Kumar', color: 'var(--ka-0d9488)', created: '2024-05-12' },
  { id: 'g-ert', name: 'Emergency Response Team', desc: 'Fire wardens and first aiders across all sites.', type: 'Static', rule: '', members: pick((_, i) => i % 26 === 4), roleIds: [], owner: 'Tariq Saleh', color: 'var(--ka-db2777)', created: '2024-11-20' },
  { id: 'g-front', name: 'Visitor Desk', desc: 'Receptionists and front-desk backup.', type: 'Static', rule: '', members: pick((u) => u.roleId === 'r-rec'), roleIds: ['r-rec'], owner: 'Reem Al Zaabi', color: 'var(--ka-0891b2)', created: '2025-01-15' },
];

/* ---------------- Audit log ---------------- */
export const ADMINS = [
  { name: 'Rex Kumar', initials: 'RK', color: 'var(--ka-7c3aed)' },
  { name: 'Sara Ahmed', initials: 'SA', color: 'var(--ka-2563eb)' },
  { name: 'Mohammed Tariq', initials: 'MT', color: 'var(--ka-7c3aed)' },
  { name: 'Priya Nair', initials: 'PN', color: 'var(--ka-db2777)' },
  { name: 'Omar Khalid', initials: 'OK', color: 'var(--ka-0891b2)' },
  { name: 'System', initials: 'SY', color: 'var(--ka-64748b)' },
];
const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime();
const A = (a: (typeof ADMINS)[number]) => ({ actor: a.name, initials: a.initials, color: a.color });
function buildAudit(): AuditEntry[] {
  const [RK, SA, MT, PN, OK, SY] = ADMINS;
  const top: AuditEntry[] = [
    { id: 'AU-9005', at: at(2026, 10, 14, 9, 42), ...A(RK), action: 'Created', entity: 'Department', target: 'Facilities - UAE', detail: 'Department created under Head Office (UAE Business Unit)', category: 'Organization', severity: 'Info', ip: '10.12.4.21', after: 'name: Facilities\nsite: Head Office\nhead: Imran Qureshi' },
    { id: 'AU-9004', at: at(2026, 10, 14, 9, 15), ...A(SA), action: 'Updated', entity: 'Site', target: 'Abu Dhabi Office', detail: 'Address and capacity updated', category: 'Organization', severity: 'Info', ip: '10.12.8.44', before: 'capacity: 120\naddress: Al Reem Island, Abu Dhabi', after: 'capacity: 140\naddress: Al Maryah Island, ADGM Square, Abu Dhabi' },
    { id: 'AU-9003', at: at(2026, 10, 13, 17, 30), ...A(MT), action: 'Created', entity: 'User Group', target: 'Operations Team', detail: 'Dynamic group: Department name contains "Operations"', category: 'Users & Roles', severity: 'Info', ip: '10.14.2.9', after: 'type: Dynamic\nrule: department contains "Operations"' },
    { id: 'AU-9002', at: at(2026, 10, 13, 11, 20), ...A(RK), action: 'Updated', entity: 'Branding', target: 'Logo and Theme', detail: 'Logo replaced and primary colour set to var(--ka-7c3aed)', category: 'Branding', severity: 'Info', ip: '10.12.4.21', before: 'primary: var(--ka-6d28d9)', after: 'primary: var(--ka-7c3aed)' },
    { id: 'AU-9001', at: at(2026, 10, 12, 16, 10), ...A(SA), action: 'Configured', entity: 'SSO Configuration', target: 'SAML settings updated', detail: 'Azure AD SAML certificate rotated, signing algorithm SHA-256', category: 'Security', severity: 'Warning', ip: '10.12.8.44', before: 'certificate: expires 30 Oct 2026', after: 'certificate: expires 12 Oct 2028' },
  ];
  const tpl: [string, string, string, AuditEntry['category'], AuditEntry['severity']][] = [
    ['Updated', 'User', 'Role changed to Supervisor', 'Users & Roles', 'Info'],
    ['Created', 'User', 'User invited by email', 'Users & Roles', 'Info'],
    ['Locked', 'User', 'Account locked after 5 failed sign-in attempts', 'Security', 'Warning'],
    ['Updated', 'Role', 'Permissions changed on Visitor Management', 'Users & Roles', 'Warning'],
    ['Updated', 'Module Access', 'Module enabled for Kuwait Business Unit', 'System', 'Info'],
    ['Updated', 'Password Policy', 'Minimum length raised to 12 characters', 'Security', 'Warning'],
    ['Exported', 'Report', 'Attendance report exported to CSV', 'Data & Privacy', 'Info'],
    ['Completed', 'Data Request', 'Data subject access request fulfilled', 'Data & Privacy', 'Info'],
    ['Updated', 'Department', 'Department head changed', 'Organization', 'Info'],
    ['Created', 'Team', 'Team created', 'Organization', 'Info'],
    ['Updated', 'System Setting', 'Session timeout set to 30 minutes', 'System', 'Info'],
    ['Failed Login', 'Authentication', 'Invalid password', 'Authentication', 'Warning'],
    ['Deleted', 'API Key', 'Unused API key revoked', 'Security', 'Critical'],
    ['Updated', 'Subscription', 'Seat count changed', 'Subscription', 'Info'],
    ['Login', 'Authentication', 'Signed in with SSO (Azure AD)', 'Authentication', 'Info'],
  ];
  const rest: AuditEntry[] = [];
  const base = at(2026, 10, 12, 15, 0);
  for (let i = 0; i < 340; i++) {
    const [action, entity, detail, category, severity] = tpl[(i * 7) % tpl.length];
    const who = category === 'Authentication' ? USERS[(i * 37) % USERS.length] : null;
    const admin = [RK, SA, MT, PN, OK, SY][(i * 5) % 6];
    const u = USERS[(i * 53) % USERS.length];
    const target = entity === 'User' || entity === 'Authentication' ? (who ?? u).name : entity === 'Role' ? ROLES[i % ROLES.length].name : entity === 'Department' || entity === 'Team' ? DEPARTMENTS[i % DEPARTMENTS.length].name : entity === 'Module Access' ? MODULE_LIST[i % MODULE_LIST.length].title : entity;
    rest.push({
      id: `AU-${8999 - i}`, at: base - i * 2.3 * 3600_000 - ((i * 977) % 3600) * 1000,
      ...(who ? { actor: who.name, initials: who.initials, color: who.avatar } : A(admin)),
      action, entity, target, detail, category, severity, ip: `10.${12 + (i % 4)}.${(i * 3) % 30}.${(i * 11) % 250}`,
    });
  }
  return [...top, ...rest];
}
export const AUDIT = buildAudit();

/* ---------------- Privacy ---------------- */
export const RETENTION: RetentionPolicy[] = [
  { id: 'rp1', category: 'Access control events', module: 'Physical Access Control', days: 'Default', action: 'Delete', records: 1_284_220, legalHold: false, basis: 'Legitimate interest (security)' },
  { id: 'rp2', category: 'Visitor records & ID scans', module: 'Visitor Management', days: 180, action: 'Anonymize', records: 48_312, legalHold: false, basis: 'Consent at check-in' },
  { id: 'rp3', category: 'CCTV snapshots & clips', module: 'Physical Access Control', days: 30, action: 'Delete', records: 92_640, legalHold: true, basis: 'Legitimate interest (security)' },
  { id: 'rp4', category: 'Location history (RTLS)', module: 'Real-Time Location', days: 90, action: 'Anonymize', records: 3_812_455, legalHold: false, basis: 'Employment contract' },
  { id: 'rp5', category: 'Attendance & timesheets', module: 'Time & Attendance', days: 2555, action: 'Archive', records: 612_044, legalHold: false, basis: 'Legal obligation (labour law)' },
  { id: 'rp6', category: 'Biometric templates', module: 'People & Identity', days: 'Default', action: 'Delete', records: 1_104, legalHold: false, basis: 'Explicit consent' },
  { id: 'rp7', category: 'Audit & system logs', module: 'Administration', days: 1095, action: 'Archive', records: 486_920, legalHold: false, basis: 'Legal obligation' },
  { id: 'rp8', category: 'Contractor documents', module: 'Contractor & Vendor', days: 730, action: 'Archive', records: 12_870, legalHold: false, basis: 'Contract' },
  { id: 'rp9', category: 'Wellbeing & incident reports', module: 'Safety & Wellbeing', days: 2555, action: 'Archive', records: 3_402, legalHold: true, basis: 'Legal obligation (OSH)' },
];
const dsar = (id: string, type: Dsar['type'], requester: string, kind: Dsar['kind'], received: string, status: Dsar['status'], assignee: string, systems: string[], note: string): Dsar => {
  const due = new Date(received);
  due.setDate(due.getDate() + 30);
  return { id, type, requester, email: `${requester.toLowerCase().replace(/ /g, '.')}@${kind === 'Employee' ? 'dcs.ae' : 'mail.com'}`, kind, received, due: due.toISOString().slice(0, 10), status, assignee, systems, note };
};
export const DSARS: Dsar[] = [
  dsar('DSR-2026-041', 'Access', 'Layla Hassan', 'Employee', '2026-10-28', 'In Progress', 'Priya Nair', ['People & Identity', 'Time & Attendance', 'Access Control'], 'Requests copy of all attendance and access records for 2026.'),
  dsar('DSR-2026-040', 'Erasure', 'James Walker', 'Visitor', '2026-10-24', 'Verifying', 'Priya Nair', ['Visitor Management', 'CCTV'], 'Visited Head Office 03 Sep 2026; requests deletion of ID scan.'),
  dsar('DSR-2026-039', 'Rectification', 'Hana Rahman', 'Employee', '2026-10-20', 'New', 'Sara Ahmed', ['People & Identity'], 'Name spelling and nationality incorrect.'),
  dsar('DSR-2026-038', 'Portability', 'Kevin Fernandes', 'Ex-employee', '2026-10-11', 'In Progress', 'Priya Nair', ['People & Identity', 'Training'], 'Training certificates export in machine-readable format.'),
  dsar('DSR-2026-037', 'Erasure', 'Ahmed Siddiqui', 'Contractor', '2026-10-06', 'In Progress', 'Omar Khalid', ['Contractor & Vendor', 'Access Control', 'RTLS'], 'Contract ended 30 Sep 2026.'),
  dsar('DSR-2026-036', 'Access', 'Maria Lopez', 'Visitor', '2026-09-30', 'Completed', 'Priya Nair', ['Visitor Management'], 'Report delivered by secure link.'),
  dsar('DSR-2026-035', 'Restriction', 'Tariq Saleh', 'Employee', '2026-09-22', 'Completed', 'Sara Ahmed', ['RTLS'], 'Location tracking restricted outside shift hours.'),
  dsar('DSR-2026-034', 'Erasure', 'Daniel Brooks', 'Visitor', '2026-09-15', 'Rejected', 'Priya Nair', ['Visitor Management'], 'Record under legal hold (incident INC-2026-118).'),
  dsar('DSR-2026-033', 'Access', 'Noura Ahmed', 'Employee', '2026-09-03', 'Completed', 'Priya Nair', ['Time & Attendance'], 'Delivered.'),
];
export const PII_FIELDS = [
  { id: 'emiratesId', label: 'Emirates ID / National ID', sample: '784-1990-1234567-1', masked: true, roles: 'HR Manager, Super Admin' },
  { id: 'passport', label: 'Passport number', sample: 'N1234567', masked: true, roles: 'HR Manager' },
  { id: 'phone', label: 'Mobile number', sample: '+971 50 123 4567', masked: true, roles: 'Supervisor and above' },
  { id: 'dob', label: 'Date of birth', sample: '14 Mar 1990', masked: false, roles: 'HR Manager' },
  { id: 'salary', label: 'Salary & bank details', sample: 'AE07 0331 2345 6789 0123 456', masked: true, roles: 'Finance, Super Admin' },
  { id: 'medical', label: 'Medical & wellbeing notes', sample: 'Asthma — carries inhaler', masked: true, roles: 'Occupational Health' },
  { id: 'plate', label: 'Vehicle plate', sample: 'Dubai A 12345', masked: false, roles: 'Security Manager' },
];
export const CONSENTS = [
  { label: 'Biometric (face / fingerprint)', given: 1104, color: 'var(--ka-7c3aed)' },
  { label: 'Location tracking (RTLS)', given: 1012, color: 'var(--ka-2563eb)' },
  { label: 'CCTV analytics', given: 1186, color: 'var(--ka-0891b2)' },
  { label: 'Wellbeing surveys', given: 842, color: 'var(--ka-16a34a)' },
  { label: 'Marketing communications', given: 388, color: 'var(--ka-ea580c)' },
];

/* ---------------- Localization ---------------- */
export const TRANSLATIONS: Translation[] = [
  { key: 'nav.commandCenter', en: 'Command Center', ar: 'مركز القيادة', hi: 'कमांड सेंटर', fr: 'Centre de commande' },
  { key: 'nav.people', en: 'People & Identity', ar: 'الأفراد والهوية', hi: 'लोग और पहचान', fr: 'Personnes et identité' },
  { key: 'nav.attendance', en: 'Time & Attendance', ar: 'الوقت والحضور', hi: 'समय और उपस्थिति', fr: 'Temps et présence' },
  { key: 'nav.visitors', en: 'Visitor Management', ar: 'إدارة الزوار', hi: 'आगंतुक प्रबंधन', fr: 'Gestion des visiteurs' },
  { key: 'nav.emergency', en: 'Emergency & Mustering', ar: 'الطوارئ والتجمع', hi: '', fr: 'Urgence et rassemblement' },
  { key: 'action.checkIn', en: 'Check in', ar: 'تسجيل الدخول', hi: 'चेक इन', fr: 'Enregistrer' },
  { key: 'action.approve', en: 'Approve', ar: 'موافقة', hi: 'स्वीकृत करें', fr: 'Approuver' },
  { key: 'action.reject', en: 'Reject', ar: 'رفض', hi: 'अस्वीकार करें', fr: '' },
  { key: 'visitor.badge', en: 'Visitor badge', ar: 'بطاقة الزائر', hi: '', fr: 'Badge visiteur' },
  { key: 'alert.evacuate', en: 'Evacuate the building now', ar: 'أخلوا المبنى الآن', hi: 'अभी इमारत खाली करें', fr: 'Évacuez le bâtiment maintenant' },
  { key: 'kiosk.welcome', en: 'Welcome to {site}', ar: '', hi: '{site} में आपका स्वागत है', fr: 'Bienvenue à {site}' },
  { key: 'kiosk.scanId', en: 'Scan your Emirates ID', ar: 'امسح بطاقة الهوية', hi: '', fr: '' },
  { key: 'email.invite.subject', en: 'You have been invited to People360', ar: '', hi: '', fr: 'Vous êtes invité à People360' },
  { key: 'meal.preorder', en: 'Pre-order your meal', ar: 'اطلب وجبتك مسبقاً', hi: 'अपना भोजन पहले से ऑर्डर करें', fr: 'Précommandez votre repas' },
];
const TR_FILL: Record<string, Partial<Translation>> = {
  'nav.emergency': { hi: 'आपातकाल और एकत्रीकरण' }, 'action.reject': { fr: 'Rejeter' }, 'visitor.badge': { hi: 'आगंतुक बैज' },
  'kiosk.welcome': { ar: 'مرحباً بكم في {site}' }, 'kiosk.scanId': { hi: 'अपना अमीरात आईडी स्कैन करें', fr: 'Scannez votre carte d’identité' },
  'email.invite.subject': { ar: 'تمت دعوتك إلى People360', hi: 'आपको People360 में आमंत्रित किया गया है' },
};

/* ---------------- Subscription ---------------- */
export const PLANS = [
  { id: 'Professional', price: 9, seats: 500, modules: 14, features: ['Core people & attendance', 'Access & visitors', 'Standard reports', 'Email support'] },
  { id: 'Enterprise', price: 14, seats: 1500, modules: 22, features: ['Everything in Professional', 'Multi-site & business units', 'SSO, RBAC & audit', 'Workflow & integrations', '24×7 priority support'] },
  { id: 'Enterprise Plus', price: 19, seats: 5000, modules: 26, features: ['Everything in Enterprise', 'RTLS, Digital Twin & AI', 'Sub-tenants', 'Dedicated CSM & 99.95% SLA', 'Data residency choice'] },
];
export const ADDON_MODULES = ['real-time-location', 'digital-twin', 'ai-people-intelligence', 'device-edge-management'];
export const INVOICES: Invoice[] = [
  { id: 'INV-2026-0010', date: '2026-10-01', period: 'Oct 2026', amount: 28_500, status: 'Paid' },
  { id: 'INV-2026-0009', date: '2026-09-01', period: 'Sep 2026', amount: 28_500, status: 'Paid' },
  { id: 'INV-2026-0008', date: '2026-08-01', period: 'Aug 2026', amount: 28_120, status: 'Paid' },
  { id: 'INV-2026-0007', date: '2026-07-01', period: 'Jul 2026', amount: 28_120, status: 'Paid' },
  { id: 'INV-2026-0006', date: '2026-06-01', period: 'Jun 2026', amount: 27_360, status: 'Paid' },
  { id: 'INV-2026-0005', date: '2026-05-01', period: 'May 2026', amount: 27_360, status: 'Paid' },
  { id: 'INV-2026-0011', date: '2026-11-01', period: 'Nov 2026', amount: 28_500, status: 'Due' },
];
export const USAGE_MONTHS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
export const USAGE_USERS = [1012, 1034, 1061, 1088, 1102, 1131, 1150, 1168, 1183, 1206, 1229, 1248];

/* ---------------- Store ---------------- */
@Injectable({ providedIn: 'root' })
export class AdminStore {
  readonly org = signal<Org>({ ...ORG });
  readonly bus = signal<BusinessUnit[]>(BUS.map((b) => ({ ...b })));
  readonly sites = signal<Site[]>(SITES.map((s) => ({ ...s })));
  readonly depts = signal<Department[]>(DEPARTMENTS.map((d) => ({ ...d, teams: d.teams.map((t) => ({ ...t })) })));
  readonly subTenants = signal<SubTenant[]>([]);
  readonly users = signal<AppUser[]>(USERS.map((u) => ({ ...u })));
  readonly roles = signal<Role[]>(ROLES.map((r) => ({ ...r, perms: structuredClone(r.perms) })));
  readonly groups = signal<Group[]>(GROUPS.map((g) => ({ ...g })));
  readonly audit = signal<AuditEntry[]>(AUDIT);
  readonly toastMsg = signal<string | null>(null);

  readonly tenant = signal({ multiSite: true, subTenants: false, sso: true, rbac: true, retentionDays: 365, currency: 'AED - UAE Dirham' });
  readonly security = signal({
    mfa: 'Required for admins', minLength: 12, complexity: true, expiryDays: 90, history: 5, lockout: 5, lockoutMins: 15, sessionMins: 30,
    idp: 'Azure AD (SAML 2.0)', ssoEnforced: false, ipAllowlist: '10.12.0.0/16, 10.14.0.0/16, 185.45.12.0/24', ipEnforced: false, apiKeys: 6,
    idleWarnMins: 2, maxSessions: 3, rememberDays: 14, sessionBinding: true, mobileSessionDays: 30,
  });
  readonly system = signal({
    dateFormat: 'DD MMM YYYY', timeFormat: '12-hour', weekStart: 'Sunday', weekend: 'Sat-Sun', units: 'Metric',
    smtpHost: 'smtp.office365.com', smtpPort: 587, smtpFrom: 'no-reply@dcs.ae', smtpTls: true, smsProvider: 'Twilio', pushEnabled: true,
    emailDigest: 'Daily 08:00', backupFreq: 'Every 6 hours', backupRegion: 'UAE North', lastBackup: Date.now() - 2.4 * 3600_000, backupRetention: 35,
    maintenance: false, maintenanceWindow: 'Sun 01:00 – 03:00 GST', apiRate: 1200, webhookRetries: 5, logLevel: 'Info', aiFeatures: true, betaFeatures: false,
    smtpUser: 'no-reply@dcs.ae', smtpAuth: 'OAuth 2.0', smtpFromName: 'DCS People360', quietHours: '22:00 – 06:00', escalateMins: 10,
  });
  readonly moduleAccess = signal<ModuleAccessRow[]>(
    MODULE_LIST.map((m, i) => ({ path: m.path, enabled: !['digital-twin', 'device-edge-management'].includes(m.path), scope: i % 7 === 3 ? ['bu-uae', 'bu-kw', 'bu-om'] : BUS.map((b) => b.id), beta: m.path === 'ai-people-intelligence' })),
  );
  /** Notification routing: event → enabled channels. */
  readonly notifyMatrix = signal<Record<string, string[]>>({
    'Emergency / evacuation alarm': ['Email', 'SMS', 'Push', 'In-app'], 'Access denied (forced / tailgating)': ['Push', 'In-app'], 'Visitor arrival': ['Email', 'Push', 'In-app'],
    'Leave / overtime approval request': ['Email', 'In-app'], 'Late arrival / missed punch': ['Push', 'In-app'], 'Contractor document expiring': ['Email'],
    'Device offline': ['Email', 'In-app'], 'New user invited': ['Email'], 'Security policy changed': ['Email', 'In-app'], 'Weekly summary report': ['Email'],
  });
  /** Per-site opt-outs: module path → site ids where the module is switched off. */
  readonly moduleSiteOff = signal<Record<string, string[]>>({ 'meal-canteen-management': ['s-ahm', 's-dqm', 's-rlf', 's-kdc'], 'workplace-facility-services': ['s-shw', 's-ahm', 's-sll', 's-dqm', 's-str', 's-rlf', 's-msd'], 'patrol-guard-management': ['s-dxb', 's-lus'], 'real-time-location': ['s-auh', 's-mct', 's-mnm', 's-doh', 's-lus'] });
  readonly branding = signal({ primary: 'var(--ka-7c3aed)', accent: 'var(--ka-2563eb)', sidebar: 'Dark purple', radius: 12, font: 'Inter', loginTitle: 'Welcome to DCS People360', emailFooter: 'DCS Group · Office 101, Business Tower, Dubai, UAE', favicon: true, appName: 'People360' });
  readonly localization = signal({ languages: ['English (US)', 'Arabic', 'Hindi', 'French'], defaultLanguage: 'English (US)', rtl: true, dateFormat: 'DD MMM YYYY', timeFormat: '12-hour', numberFormat: '1,234.56', firstDay: 'Sunday', calendar: 'Gregorian' });
  readonly translations = signal<Translation[]>(TRANSLATIONS.map((t) => ({ ...t })));
  readonly retention = signal<RetentionPolicy[]>(RETENTION.map((r) => ({ ...r })));
  readonly dsars = signal<Dsar[]>(DSARS.map((d) => ({ ...d })));
  readonly pii = signal(PII_FIELDS.map((f) => ({ ...f })));
  readonly privacy = signal({ encryptionAtRest: 'AES-256 (customer-managed key)', inTransit: 'TLS 1.3', keyRotated: '2026-08-14', residency: 'UAE North (Dubai)', dpo: 'Priya Nair', anonymizeExports: true, consentBanner: true });
  readonly subscription = signal({ plan: 'Enterprise', term: 'Annual', start: '2026-01-01', renewal: '2026-12-31', seats: 1500, price: 14, addons: ['real-time-location', 'ai-people-intelligence'], autoRenew: true, billingEmail: 'finance@dcs.ae', po: 'PO-DCS-2026-118' });
  readonly invoices = signal<Invoice[]>(INVOICES.map((i) => ({ ...i })));

  /* ----- derived ----- */
  readonly activeUsers = computed(() => this.users().filter((u) => u.status === 'Active').length);
  readonly usersByDept = computed(() => {
    const m = new Map<string, number>();
    for (const u of this.users()) m.set(u.deptId, (m.get(u.deptId) ?? 0) + 1);
    return m;
  });
  readonly usersByRole = computed(() => {
    const m = new Map<string, number>();
    for (const u of this.users()) m.set(u.roleId, (m.get(u.roleId) ?? 0) + 1);
    return m;
  });
  readonly usersBySite = computed(() => {
    const m = new Map<string, number>();
    for (const u of this.users()) m.set(u.siteId, (m.get(u.siteId) ?? 0) + 1);
    return m;
  });
  readonly missingTranslations = computed(() => {
    const langs = this.localization().languages;
    const cols: (keyof Translation)[] = [];
    if (langs.includes('Arabic')) cols.push('ar');
    if (langs.includes('Hindi')) cols.push('hi');
    if (langs.includes('French')) cols.push('fr');
    return this.translations().reduce((a, t) => a + cols.filter((c) => !t[c]).length, 0);
  });
  readonly health = computed(() => {
    const o = this.org();
    const items = [
      { label: 'Organization Details', done: !!(o.name && o.email && o.address), weight: 15, link: 'organization-tenant-setup' },
      { label: 'Business Units', done: this.bus().length > 0, weight: 10, link: 'organization-tenant-setup' },
      { label: 'Departments', done: this.depts().length > 0, weight: 15, link: 'departments-teams' },
      { label: 'Sites & Locations', done: this.sites().length > 0, weight: 15, link: 'sites-locations' },
      { label: 'Users & Roles', done: this.users().length > 0 && this.roles().length > 0, weight: 15, link: 'user-group-management' },
      { label: 'Security Settings', done: this.tenant().sso || this.security().mfa !== 'Off', weight: 15, link: 'system-settings' },
      { label: 'Branding & Localization', done: this.missingTranslations() === 0, weight: 15, link: 'branding-localization' },
    ];
    return { items, pct: items.reduce((a, i) => a + (i.done ? i.weight : 0), 0) };
  });
  readonly seatsUsed = computed(() => this.users().filter((u) => u.status !== 'Disabled').length);
  readonly licensed = (path: string) => !ADDON_MODULES.includes(path) || this.subscription().addons.includes(path) || this.subscription().plan === 'Enterprise Plus';

  /* ----- lookups ----- */
  bu(id: string) { return this.bus().find((b) => b.id === id); }
  site(id: string) { return this.sites().find((s) => s.id === id); }
  dept(id: string) { return this.depts().find((d) => d.id === id); }
  role(id: string) { return this.roles().find((r) => r.id === id); }
  groupMembers(g: Group) {
    const rule = GROUP_RULES[g.rule];
    return rule ? this.users().filter(rule.match).map((u) => u.id) : g.members;
  }

  /* ----- mutations ----- */
  log(action: string, entity: string, target: string, detail: string, category: AuditEntry['category'], severity: AuditEntry['severity'] = 'Info', before?: string, after?: string) {
    this.audit.update((l) => [{ id: `AU-${9006 + this.audit().length}`, at: Date.now(), actor: 'Demo Login', initials: 'DL', color: 'var(--ka-7c3aed)', action, entity, target, detail, category, severity, ip: '10.12.4.77', before, after }, ...l]);
  }
  toast(m: string) {
    this.toastMsg.set(m);
    setTimeout(() => this.toastMsg() === m && this.toastMsg.set(null), 2600);
  }
  updateOrg(o: Org) {
    const prev = this.org();
    const changed = (Object.keys(o) as (keyof Org)[]).filter((k) => k !== 'logo' && o[k] !== prev[k]);
    this.org.set({ ...o });
    this.log('Updated', 'Organization', o.name, changed.length ? `Changed: ${changed.join(', ')}` : 'Organization saved', 'Organization', 'Info',
      changed.map((k) => `${k}: ${prev[k]}`).join('\n'), changed.map((k) => `${k}: ${o[k]}`).join('\n'));
  }
  setTenant<K extends keyof ReturnType<AdminStore['tenant']>>(k: K, v: ReturnType<AdminStore['tenant']>[K], label: string) {
    const prev = this.tenant()[k];
    this.tenant.update((t) => ({ ...t, [k]: v }));
    this.log('Updated', 'Tenant Setting', label, `${label}: ${prev} → ${v}`, k === 'sso' || k === 'rbac' ? 'Security' : 'Organization', k === 'sso' || k === 'rbac' ? 'Warning' : 'Info', `${k}: ${prev}`, `${k}: ${v}`);
  }
  saveBU(b: BusinessUnit) {
    const exists = this.bus().some((x) => x.id === b.id);
    if (exists) this.bus.update((l) => l.map((x) => (x.id === b.id ? b : x)));
    else this.bus.update((l) => [...l, { ...b, id: b.id || nid('bu-') }]);
    this.log(exists ? 'Updated' : 'Created', 'Business Unit', b.name, `${b.code} · ${b.country}`, 'Organization');
  }
  saveSite(s: Site) {
    const exists = this.sites().some((x) => x.id === s.id);
    if (exists) this.sites.update((l) => l.map((x) => (x.id === s.id ? s : x)));
    else this.sites.update((l) => [...l, { ...s, id: s.id || nid('s-') }]);
    this.log(exists ? 'Updated' : 'Created', 'Site', s.name, `${s.type} · ${s.city}, ${this.bu(s.buId)?.name}`, 'Organization');
  }
  saveDept(d: Department) {
    const exists = this.depts().some((x) => x.id === d.id);
    if (exists) this.depts.update((l) => l.map((x) => (x.id === d.id ? d : x)));
    else this.depts.update((l) => [...l, { ...d, id: d.id || nid('d-') }]);
    this.log(exists ? 'Updated' : 'Created', 'Department', `${d.name}`, `Under ${this.site(d.siteId)?.name}`, 'Organization');
  }
  removeNode(kind: 'bu' | 'site' | 'dept', id: string) {
    const name = kind === 'bu' ? this.bu(id)?.name : kind === 'site' ? this.site(id)?.name : this.dept(id)?.name;
    if (kind === 'bu') {
      const sids = this.sites().filter((s) => s.buId === id).map((s) => s.id);
      this.depts.update((l) => l.filter((d) => !sids.includes(d.siteId)));
      this.sites.update((l) => l.filter((s) => s.buId !== id));
      this.bus.update((l) => l.filter((b) => b.id !== id));
    } else if (kind === 'site') {
      this.depts.update((l) => l.filter((d) => d.siteId !== id));
      this.sites.update((l) => l.filter((s) => s.id !== id));
    } else this.depts.update((l) => l.filter((d) => d.id !== id));
    this.log('Deleted', kind === 'bu' ? 'Business Unit' : kind === 'site' ? 'Site' : 'Department', name ?? id, 'Removed from organization hierarchy', 'Organization', 'Warning');
  }
  patchUser(id: string, ch: Partial<AppUser>, what: string) {
    const u = this.users().find((x) => x.id === id);
    this.users.update((l) => l.map((x) => (x.id === id ? { ...x, ...ch } : x)));
    this.log('Updated', 'User', u?.name ?? id, what, ch.status === 'Locked' || ch.status === 'Disabled' ? 'Security' : 'Users & Roles', ch.status === 'Disabled' ? 'Warning' : 'Info');
  }
  addUser(u: AppUser) {
    this.users.update((l) => [u, ...l]);
    this.log('Created', 'User', u.name, `Invited as ${this.role(u.roleId)?.name} · ${this.dept(u.deptId)?.name}`, 'Users & Roles');
  }
  saveRole(r: Role, what: string) {
    const exists = this.roles().some((x) => x.id === r.id);
    this.roles.update((l) => (exists ? l.map((x) => (x.id === r.id ? r : x)) : [...l, r]));
    this.log(exists ? 'Updated' : 'Created', 'Role', r.name, what, 'Users & Roles', exists ? 'Warning' : 'Info');
  }
  deleteRole(id: string, fallback: string) {
    const r = this.role(id);
    this.users.update((l) => l.map((u) => (u.roleId === id ? { ...u, roleId: fallback } : u)));
    this.roles.update((l) => l.filter((x) => x.id !== id));
    this.log('Deleted', 'Role', r?.name ?? id, `Users moved to ${this.role(fallback)?.name}`, 'Users & Roles', 'Critical');
  }
  saveGroup(g: Group) {
    const exists = this.groups().some((x) => x.id === g.id);
    this.groups.update((l) => (exists ? l.map((x) => (x.id === g.id ? g : x)) : [g, ...l]));
    this.log(exists ? 'Updated' : 'Created', 'User Group', g.name, g.type === 'Dynamic' ? `Dynamic group: ${GROUP_RULES[g.rule]?.label}` : `${g.members.length} members`, 'Users & Roles');
  }
  reset() {
    this.org.set({ ...ORG });
    this.bus.set(BUS.map((b) => ({ ...b })));
    this.sites.set(SITES.map((s) => ({ ...s })));
    this.depts.set(DEPARTMENTS.map((d) => ({ ...d, teams: d.teams.map((t) => ({ ...t })) })));
    this.subTenants.set([]);
    this.users.set(USERS.map((u) => ({ ...u })));
    this.roles.set(ROLES.map((r) => ({ ...r, perms: structuredClone(r.perms) })));
    this.groups.set(GROUPS.map((g) => ({ ...g })));
    this.audit.set(AUDIT);
    this.tenant.set({ multiSite: true, subTenants: false, sso: true, rbac: true, retentionDays: 365, currency: 'AED - UAE Dirham' });
    this.translations.set(TRANSLATIONS.map((t) => ({ ...t })));
  }
  /** Fill missing translations (simulated machine translation). */
  autoTranslate() {
    let n = 0;
    this.translations.update((l) =>
      l.map((t) => {
        const fill = TR_FILL[t.key] ?? {};
        const out = { ...t };
        (['ar', 'hi', 'fr'] as const).forEach((c) => {
          if (!out[c]) {
            out[c] = fill[c] ?? `[${c}] ${t.en}`;
            n++;
          }
        });
        return out;
      }),
    );
    this.log('Updated', 'Localization', 'Translations', `${n} missing strings machine-translated`, 'Branding');
    return n;
  }
}
