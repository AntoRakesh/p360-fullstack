// Shared hard-coded people dataset for the People & Identity module (demo only).
import { rng } from './demo-data';

export type PersonType = 'Employee' | 'Contractor' | 'Visitor' | 'Temporary' | 'Other';
export type PStatus = 'Active' | 'On Leave' | 'Inactive' | 'Suspended';

export interface Person {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: PersonType;
  dept: string;
  designation: string;
  site: string;
  city: string;
  status: PStatus;
  manager: string;
  joined: string;
  empType: string;
  company: string;
  card: string;
  face: boolean;
  finger: boolean;
  mobileCred: boolean;
  completion: number;
  initials: string;
  avatar: string;
}

export const TYPE_COUNTS: Record<PersonType, number> = { Employee: 8920, Contractor: 1326, Visitor: 284, Temporary: 520, Other: 1430 };
export const PERSON_TYPES = Object.keys(TYPE_COUNTS) as PersonType[];
export const DEPTS = ['IT', 'HR', 'Operations', 'Facility Maintenance', 'Finance', 'Logistics', 'Sales', 'Marketing', 'R&D', 'Support', 'Legal'];
export const SITES = ['Head Office', 'Manufacturing', 'Warehouse', 'Regional Office', 'Tech Center', 'Data Center', 'Logistics Hub', 'Retail Stores'];
const CITY: Record<string, string> = {
  'Head Office': 'Dubai, UAE', Manufacturing: 'Abu Dhabi, UAE', Warehouse: 'Jebel Ali, UAE', 'Regional Office': 'Riyadh, KSA',
  'Tech Center': 'Dubai, UAE', 'Data Center': 'Dubai South, UAE', 'Logistics Hub': 'Sharjah, UAE', 'Retail Stores': 'Dubai, UAE',
};
const DESIGNATIONS: Record<string, string[]> = {
  IT: ['Senior Network Engineer', 'Systems Administrator', 'Software Engineer', 'IT Support Specialist'],
  HR: ['Head of HR', 'HR Business Partner', 'Talent Acquisition Lead', 'HR Executive'],
  Operations: ['Operations Manager', 'Shift Supervisor', 'Operations Analyst', 'Plant Operator'],
  'Facility Maintenance': ['Electrician', 'HVAC Technician', 'Facility Supervisor', 'Plumber'],
  Finance: ['Finance Manager', 'Accountant', 'Financial Analyst', 'Payroll Specialist'],
  Logistics: ['Logistics Coordinator', 'Warehouse Associate', 'Fleet Supervisor', 'Forklift Operator'],
  Sales: ['Account Manager', 'Sales Executive', 'Regional Sales Lead', 'Inside Sales Rep'],
  Marketing: ['Marketing Manager', 'Content Specialist', 'Brand Executive', 'Digital Marketer'],
  'R&D': ['Research Scientist', 'Product Engineer', 'Lab Technician', 'R&D Manager'],
  Support: ['Support Agent', 'Customer Success Lead', 'Service Desk Analyst', 'Support Supervisor'],
  Legal: ['Legal Counsel', 'Compliance Officer', 'Paralegal', 'Contracts Manager'],
};
const FIRST = ['Arjun', 'Priya', 'Mohammed', 'Fatima', 'Ahmed', 'David', 'Sophie', 'Chen', 'Maria', 'Liam', 'Aisha', 'Omar', 'Sara', 'Rahul', 'Anita', 'Yusuf', 'Emma', 'Noah', 'Layla', 'Ravi', 'Grace', 'Hassan', 'Meera', 'James', 'Zara', 'Kenji', 'Lucas', 'Nadia', 'Tom', 'Hannah', 'Vikram', 'Sofia', 'Ibrahim', 'Chloe', 'Daniel', 'Leila', 'Karan', 'Noura', 'Alex', 'Mina'];
const LAST = ['Mehta', 'Sharma', 'Ali', 'Al Mansoori', 'Hassan', 'Lee', 'Martin', 'Wei', 'Santos', "O'Connor", 'Rahman', 'Khalid', 'Nair', 'Kapoor', 'Iyer', 'Wilson', 'Brown', 'Haddad', 'Shankar', 'Park', 'Rao', 'Rossi', 'Musa', 'Carter', 'Khan', 'Sato', 'Silva', 'Hussein', 'Baker', 'Kim', 'Patel', 'Saleh', 'Garcia', 'Chen', 'Fernandes', 'Joseph', 'Thomas', 'Ahmed', 'Verma', 'Gupta'];
const COMPANIES: Record<PersonType, string[]> = {
  Employee: ['People360 Corp'],
  Contractor: ['BuildRight LLC', 'SafeGuard Security', 'CleanPro Services', 'TechServe FM', 'Rapid Logistics', 'Spark Electricals'],
  Visitor: ['Acme Corp', 'Globex', 'Initech', 'Umbrella Ltd', 'Stark Industries', 'Hooli'],
  Temporary: ['StaffNow Agency', 'TempForce', 'GulfTalent Staffing', 'QuickHire'],
  Other: ['Interns Program', 'Board Members', 'Alumni', 'Partners'],
};
const EMAIL_DOMAIN: Record<PersonType, string> = { Employee: 'company.com', Contractor: 'vendor.com', Visitor: 'visitor.com', Temporary: 'agency.com', Other: 'partner.com' };
const PREFIX: Record<PersonType, string> = { Employee: 'EMP', Contractor: 'CON', Visitor: 'VIS', Temporary: 'TMP', Other: 'OTH' };
const COLORS = ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0d9488)', 'var(--ka-ca8a04)', 'var(--ka-db2777)', 'var(--ka-475569)', 'var(--ka-16a34a)', 'var(--ka-ea580c)', 'var(--ka-9333ea)', 'var(--ka-0891b2)'];

const initialsOf = (n: string) => n.split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
const colorOf = (n: string) => COLORS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

function make(p: Partial<Person> & Pick<Person, 'id' | 'name' | 'type' | 'dept' | 'site' | 'status'>, r: () => number): Person {
  const [first, ...rest] = p.name.toLowerCase().replace(/'/g, '').split(' ');
  const designation = p.designation ?? (p.type === 'Visitor' ? 'Guest' : DESIGNATIONS[p.dept]?.[Math.floor(r() * 4)] ?? 'Associate');
  return {
    email: `${first}.${rest.join('').slice(0, 8)}@${EMAIL_DOMAIN[p.type]}`,
    phone: `+971 5${Math.floor(r() * 9)} ${100 + Math.floor(r() * 899)} ${1000 + Math.floor(r() * 8999)}`,
    designation,
    city: CITY[p.site] ?? 'Dubai, UAE',
    manager: 'Priya Sharma',
    joined: new Date(2016 + Math.floor(r() * 10), Math.floor(r() * 12), 1 + Math.floor(r() * 27)).toISOString().slice(0, 10),
    empType: p.type === 'Employee' ? (r() < 0.9 ? 'Full Time' : 'Part Time') : p.type === 'Temporary' ? 'Agency' : p.type === 'Contractor' ? 'Contract' : '—',
    company: COMPANIES[p.type][Math.floor(r() * COMPANIES[p.type].length)],
    card: `AC-${String(Math.floor(r() * 99999)).padStart(5, '0')}`,
    face: r() < 0.86,
    finger: r() < 0.72,
    mobileCred: r() < 0.55,
    completion: Math.round(55 + r() * 45),
    initials: initialsOf(p.name),
    avatar: colorOf(p.name),
    ...p,
  } as Person;
}

const FEATURED: [string, PersonType, string, string, string, PStatus, string][] = [
  ['Arjun Mehta', 'Employee', 'EMP-00123', 'IT', 'Head Office', 'Active', 'arjun.mehta@company.com'],
  ['Priya Sharma', 'Employee', 'EMP-00124', 'HR', 'Head Office', 'Active', 'priya.sharma@company.com'],
  ['Mohammed Ali', 'Employee', 'EMP-00125', 'Operations', 'Warehouse', 'Active', 'mohammed.ali@company.com'],
  ['Ramesh Kumar', 'Contractor', 'CON-00456', 'Facility Maintenance', 'Manufacturing', 'Active', 'ramesh.kumar@vendor.com'],
  ['Fatima Al Mansoori', 'Employee', 'EMP-00126', 'Finance', 'Head Office', 'Active', 'fatima.m@company.com'],
  ['Ahmed Hassan', 'Contractor', 'CON-00457', 'Logistics', 'Warehouse', 'Active', 'ahmed.h@contractor.com'],
  ['David Lee', 'Employee', 'EMP-00127', 'Sales', 'Regional Office', 'Active', 'david.lee@company.com'],
  ['Sophie Martin', 'Employee', 'EMP-00128', 'Marketing', 'Head Office', 'On Leave', 'sophie.m@company.com'],
  ['Chen Wei', 'Employee', 'EMP-00129', 'R&D', 'Tech Center', 'Active', 'chen.wei@company.com'],
  ['Maria Santos', 'Visitor', 'VIS-00982', '—', 'Head Office', 'Active', 'maria.s@visitor.com'],
  ["Liam O'Connor", 'Temporary', 'TMP-00765', 'Support', 'Data Center', 'Active', 'liam.o@agency.com'],
  ['Aisha Rahman', 'Employee', 'EMP-00130', 'Legal', 'Head Office', 'Inactive', 'aisha.r@company.com'],
];

/** 12,480 people: 12 featured from the reference design + deterministic generated roster. */
export const PEOPLE: Person[] = (() => {
  const r = rng(2026);
  const out: Person[] = FEATURED.map(([name, type, id, dept, site, status, email]) => make({ name, type, id, dept, site, status, email }, r));
  out[0] = {
    ...out[0],
    designation: 'Senior Network Engineer',
    phone: '+971 50 123 4567',
    joined: '2022-01-15',
    empType: 'Full Time',
    card: 'AC-00456',
    completion: 85,
    face: true,
    finger: true,
    mobileCred: true,
  };
  out[1] = { ...out[1], designation: 'Head of IT', manager: 'Omar Khalid' };
  const used: Record<PersonType, number> = { Employee: 8, Contractor: 2, Visitor: 1, Temporary: 1, Other: 0 };
  const next: Record<PersonType, number> = { Employee: 131, Contractor: 458, Visitor: 983, Temporary: 766, Other: 101 };
  const sitesW = ['Head Office', 'Head Office', 'Head Office', 'Manufacturing', 'Manufacturing', 'Warehouse', 'Warehouse', 'Regional Office', 'Tech Center', 'Data Center', 'Logistics Hub', 'Retail Stores'];
  for (const type of PERSON_TYPES) {
    while (used[type] < TYPE_COUNTS[type]) {
      const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
      const st = r();
      out.push(
        make(
          {
            id: `${PREFIX[type]}-${String(next[type]++).padStart(5, '0')}`,
            name,
            type,
            dept: type === 'Visitor' ? '—' : DEPTS[Math.floor(r() * DEPTS.length)],
            site: sitesW[Math.floor(r() * sitesW.length)],
            status: st < 0.9 ? 'Active' : st < 0.95 ? 'On Leave' : st < 0.985 ? 'Inactive' : 'Suspended',
            manager: FEATURED[Math.floor(r() * 5)][0],
          },
          r,
        ),
      );
      used[type]++;
    }
  }
  return out;
})();

export const byId = (id: string) => PEOPLE.find((p) => p.id === id);

export interface Activity {
  title: string;
  detail: string;
  when: string;
  kind: 'access' | 'attendance' | 'document' | 'credential' | 'profile';
}

export function activityFor(p: Person): Activity[] {
  return [
    { title: 'Access Granted', detail: `Main Entrance - ${p.site}`, when: 'Today, 09:12 AM', kind: 'access' },
    { title: 'Attendance Check-In', detail: p.site, when: 'Today, 09:00 AM', kind: 'attendance' },
    { title: 'Document Updated', detail: 'Passport', when: '12 Oct 2026, 02:15 PM', kind: 'document' },
    { title: 'Access Card Issued', detail: `Card #${p.card}`, when: '10 Oct 2026, 11:20 AM', kind: 'credential' },
    { title: 'Profile Updated', detail: 'Personal Details', when: '08 Oct 2026, 04:30 PM', kind: 'profile' },
    { title: 'Access Granted', detail: `Lift Lobby - ${p.site}`, when: '07 Oct 2026, 08:58 AM', kind: 'access' },
    { title: 'Attendance Check-Out', detail: p.site, when: '06 Oct 2026, 06:04 PM', kind: 'attendance' },
  ];
}

export const typeTag = (t: string) =>
  ({ Employee: 'tag', Contractor: 'tag amber', Visitor: 'tag blue', Temporary: 'tag teal', Other: 'tag grey' })[t] ?? 'tag grey';
