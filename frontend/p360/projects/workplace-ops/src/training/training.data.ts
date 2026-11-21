// Training, Skills & Compliance — one hard-coded dataset + a root store shared by all 9 pages.
import { Injectable, computed, signal } from '@angular/core';
import { rng } from '@p360/shared/data/demo-data';
import { downloadCsv } from '@p360/shared/data/demo-data';

export { downloadCsv };
export const BASE = '/training-skills-compliance';

/* ---------------- dates ---------------- */
const T0 = new Date();
T0.setHours(0, 0, 0, 0);
export const TODAY = T0;
export const iso = (days: number) => {
  const d = new Date(T0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const daysUntil = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - T0.getTime()) / 86400000);
};
export const fd = (s: string) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
export const addMonths = (s: string, months: number) => {
  const [y, m, d] = s.split('-').map(Number);
  const x = new Date(y, m - 1 + months, d);
  return iso(Math.round((x.getTime() - T0.getTime()) / 86400000));
};

/* ---------------- org-level constants (one dataset, used on every page) ---------------- */
export const TOTAL_EMPLOYEES = 1248;
/** Overall proficiency bands across all 1,248 employees (Skill Proficiency Overview). */
export const BANDS = [
  { key: 'Proficient', value: 850, color: 'var(--ka-22c55e)' },
  { key: 'Intermediate', value: 224, color: 'var(--ka-3b82f6)' },
  { key: 'Basic', value: 112, color: 'var(--ka-f59e0b)' },
  { key: 'Not Trained', value: 62, color: 'var(--ka-ef4444)' },
];
export const DEPTS = ['Operations', 'Maintenance', 'Security', 'Logistics', 'Facilities', 'HSE', 'Production', 'Administration'];
export const SITES = ['Head Office', 'Manufacturing', 'Warehouse', 'Logistics Hub', 'Retail Stores', 'Data Center'];
export const CATEGORIES = ['Safety', 'Technical', 'Soft Skills', 'Compliance'] as const;
export type Category = (typeof CATEGORIES)[number];
export const LEVEL_NAMES = ['Not Trained', 'Basic', 'Basic', 'Intermediate', 'Proficient', 'Proficient'];
export const levelName = (l: number | null) => (l === null ? 'Not Applicable' : LEVEL_NAMES[l]);
/** Cell colours exactly as the matrix: 4-5 green, 3 blue, 2 orange, 1/0 red, N/A grey. */
export const levelTone = (l: number | null) =>
  l === null ? 'na' : l >= 4 ? 'green' : l === 3 ? 'blue' : l === 2 ? 'orange' : 'red';
export const TONES: Record<string, { bg: string; fg: string }> = {
  green: { bg: 'var(--kb-d9f7e3)', fg: 'var(--kf-15803d)' },
  blue: { bg: 'var(--kb-dbe7ff)', fg: 'var(--kf-1d4ed8)' },
  orange: { bg: 'var(--kb-fde7c8)', fg: 'var(--kf-c2410c)' },
  red: { bg: 'var(--kb-fddde1)', fg: 'var(--kf-be123c)' },
  na: { bg: 'var(--kb-f1f2f6)', fg: 'var(--kf-6b7280)' },
};

/* ---------------- skills ---------------- */
export interface Skill {
  id: string;
  name: string;
  category: Category;
  icon: string;
  color: string;
  /** Required level for most roles. */
  required: number;
  /** Org-wide employees below the required level. */
  gap: number;
  courseId: string;
}
export const SKILL_SEED: Skill[] = [
  { id: 'fa', name: 'First Aid', category: 'Safety', icon: 'training-first-aid', color: 'var(--ka-ef4444)', required: 3, gap: 42, courseId: 'C-101' },
  { id: 'fs', name: 'Fire Safety', category: 'Safety', icon: 'flame', color: 'var(--ka-ef4444)', required: 3, gap: 36, courseId: 'C-102' },
  { id: 'eo', name: 'Equipment Operation', category: 'Safety', icon: 'training-helmet', color: 'var(--ka-f59e0b)', required: 3, gap: 28, courseId: 'C-103' },
  { id: 'sp', name: 'Security Procedures', category: 'Safety', icon: 'shield-check', color: 'var(--ka-2563eb)', required: 3, gap: 24, courseId: 'C-104' },
  { id: 'er', name: 'Emergency Response', category: 'Safety', icon: 'run', color: 'var(--ka-16a34a)', required: 3, gap: 18, courseId: 'C-105' },
  { id: 'hi', name: 'Hazard Identification', category: 'Safety', icon: 'triangle-alert', color: 'var(--ka-f59e0b)', required: 3, gap: 16, courseId: 'C-106' },
  { id: 'wah', name: 'Working at Height', category: 'Safety', icon: 'training-climb', color: 'var(--ka-1f2937)', required: 3, gap: 14, courseId: 'C-107' },
  { id: 'fl', name: 'Forklift Operation', category: 'Safety', icon: 'training-forklift', color: 'var(--ka-1f2937)', required: 3, gap: 11, courseId: 'C-108' },
  { id: 'em', name: 'Electrical Maintenance', category: 'Technical', icon: 'training-bolt', color: 'var(--ka-eab308)', required: 3, gap: 9, courseId: 'C-201' },
  { id: 'plc', name: 'PLC Programming', category: 'Technical', icon: 'cpu', color: 'var(--ka-7c3aed)', required: 3, gap: 8, courseId: 'C-202' },
  { id: 'wd', name: 'Welding', category: 'Technical', icon: 'flame', color: 'var(--ka-ea580c)', required: 3, gap: 5, courseId: 'C-203' },
  { id: 'hv', name: 'HVAC Systems', category: 'Technical', icon: 'training-fan', color: 'var(--ka-0891b2)', required: 3, gap: 4, courseId: 'C-204' },
  { id: 'qi', name: 'Quality Inspection', category: 'Technical', icon: 'file-check', color: 'var(--ka-0d9488)', required: 3, gap: 3, courseId: 'C-205' },
  { id: 'ld', name: 'Leadership', category: 'Soft Skills', icon: 'star', color: 'var(--ka-7c3aed)', required: 3, gap: 0, courseId: 'C-301' },
  { id: 'cm', name: 'Communication', category: 'Soft Skills', icon: 'message', color: 'var(--ka-2563eb)', required: 3, gap: 0, courseId: 'C-302' },
  { id: 'cs', name: 'Customer Service', category: 'Soft Skills', icon: 'users', color: 'var(--ka-db2777)', required: 3, gap: 0, courseId: 'C-303' },
  { id: 'ps', name: 'Problem Solving', category: 'Soft Skills', icon: 'lightbulb', color: 'var(--ka-ca8a04)', required: 3, gap: 0, courseId: 'C-304' },
  { id: 'dp', name: 'Data Privacy', category: 'Compliance', icon: 'key-round', color: 'var(--ka-475569)', required: 3, gap: 0, courseId: 'C-401' },
  { id: 'ab', name: 'Anti-Bribery', category: 'Compliance', icon: 'ban', color: 'var(--ka-b91c1c)', required: 3, gap: 0, courseId: 'C-402' },
  { id: 'cc', name: 'Code of Conduct', category: 'Compliance', icon: 'file-text', color: 'var(--ka-4f46e5)', required: 3, gap: 0, courseId: 'C-403' },
  { id: 'iso', name: 'ISO 45001 Awareness', category: 'Compliance', icon: 'shield', color: 'var(--ka-0f766e)', required: 3, gap: 0, courseId: 'C-404' },
  { id: 'env', name: 'Environmental Awareness', category: 'Compliance', icon: 'tree', color: 'var(--ka-16a34a)', required: 3, gap: 0, courseId: 'C-405' },
];
/** Skills in the framework that are not shown as matrix columns (86 tracked in total). */
export const OTHER_TRACKED = 86 - SKILL_SEED.length;

/* ---------------- matrix employees ---------------- */
export interface Look {
  g: 'm' | 'f';
  skin: string;
  hair: string;
  uni: string;
  cap?: boolean;
  scarf?: boolean;
}
export interface TEmp {
  id: string;
  name: string;
  role: string;
  dept: string;
  site: string;
  status: 'Active' | 'On Leave';
  look: Look;
  levels: Record<string, number | null>;
  /** Skills whose refresher is due (status "Due for Training"). */
  due: string[];
  joined: string;
  email: string;
}
const SAFETY = ['fa', 'fs', 'eo', 'sp', 'er', 'hi', 'wah', 'fl'];
const SKIN = ['var(--ka-f1c7a5)', 'var(--ka-d9a47a)', 'var(--ka-b97a52)', 'var(--ka-8d5a3b)', 'var(--ka-e8b996)'];
const HAIR = ['var(--ka-1f1a17)', 'var(--ka-3b2a20)', 'var(--ka-5a3b22)', 'var(--ka-2b2b2b)', 'var(--ka-6b4a2b)'];
const UNI = ['var(--ka-1e3a8a)', 'var(--ka-334155)', 'var(--ka-0f766e)', 'var(--ka-7c2d12)', 'var(--ka-1f2937)', 'var(--ka-4338ca)'];

// [name, role, dept, site, g, levels (8 safety, -1 = N/A), due, cap, scarf]
type Row = [string, string, string, string, 'm' | 'f', number[], string[], boolean?, boolean?];
const MATRIX_ROWS: Row[] = [
  ['Ahmed Hassan', 'Technician', 'Operations', 'Head Office', 'm', [4, 3, 2, 3, 4, 3, 1, 4], ['fs'], true],
  ['Priya Sharma', 'Safety Officer', 'Operations', 'Head Office', 'f', [5, 5, 3, 4, 5, 4, 3, -1], []],
  ['Ramesh Kumar', 'Operator', 'Operations', 'Manufacturing', 'm', [2, 3, 4, 2, 3, 3, 2, 5], ['fa']],
  ['Maria Santos', 'Supervisor', 'Operations', 'Head Office', 'f', [4, 4, 3, 4, 4, 4, 3, 4], []],
  ['Ali Khan', 'Technician', 'Operations', 'Manufacturing', 'm', [1, 2, 3, 2, 3, 2, 1, 4], ['fs']],
  ['Fatima Ali', 'Safety Officer', 'Operations', 'Warehouse', 'f', [5, 5, 4, 4, 5, 4, 4, -1], [], false, true],
  ['Chen Wei', 'Operator', 'Operations', 'Warehouse', 'm', [2, 3, 5, 3, 4, 3, 2, 5], ['wah']],
  ['David Lee', 'Supervisor', 'Operations', 'Head Office', 'm', [4, 4, 3, 4, 4, 4, 3, 4], []],
  ['Omar Khalid', 'Technician', 'Maintenance', 'Manufacturing', 'm', [3, 4, 4, 2, 3, 4, 4, 3], ['sp']],
  ['Sarah Johnson', 'Supervisor', 'Maintenance', 'Manufacturing', 'f', [4, 4, 3, 3, 4, 5, 3, -1], []],
  ['Vikram Rao', 'Electrician', 'Maintenance', 'Manufacturing', 'm', [3, 3, 4, 2, 3, 4, 4, -1], ['fa']],
  ['Kenji Sato', 'Technician', 'Maintenance', 'Data Center', 'm', [2, 3, 4, 3, 2, 3, 3, -1], ['er']],
  ['Aisha Bello', 'Technician', 'Maintenance', 'Head Office', 'f', [3, 4, 3, 3, 4, 3, 2, -1], []],
  ['Lucas Silva', 'Electrician', 'Maintenance', 'Warehouse', 'm', [4, 3, 5, 2, 3, 4, 5, 3], []],
  ['Meera Iyer', 'Safety Officer', 'Maintenance', 'Manufacturing', 'f', [5, 5, 3, 4, 5, 5, 4, -1], []],
  ['Tom Baker', 'Technician', 'Maintenance', 'Logistics Hub', 'm', [1, 2, 3, 2, 2, 2, 3, 2], ['fa', 'fs']],
  ['Yusuf Rahman', 'Security Officer', 'Security', 'Head Office', 'm', [4, 4, -1, 5, 4, 3, -1, -1], [], true],
  ['Nadia Hussein', 'Security Officer', 'Security', 'Head Office', 'f', [3, 4, -1, 5, 4, 3, -1, -1], [], false, true],
  ['James Carter', 'Supervisor', 'Security', 'Manufacturing', 'm', [4, 5, -1, 5, 5, 4, -1, -1], [], true],
  ['Ibrahim Musa', 'Security Officer', 'Security', 'Warehouse', 'm', [2, 3, -1, 4, 3, 2, -1, -1], ['fa'], true],
  ['Grace Park', 'Security Officer', 'Security', 'Retail Stores', 'f', [3, 3, -1, 4, 3, 3, -1, -1], []],
  ['Daniel Kim', 'Security Officer', 'Security', 'Data Center', 'm', [4, 3, -1, 4, 4, 3, -1, -1], [], true],
  ['Layla Haddad', 'Supervisor', 'Security', 'Logistics Hub', 'f', [5, 4, -1, 5, 4, 4, -1, -1], []],
  ['Noah Brown', 'Security Officer', 'Security', 'Head Office', 'm', [1, 2, -1, 3, 2, 2, -1, -1], ['fa'], true],
  ['Ravi Shankar', 'Driver', 'Logistics', 'Logistics Hub', 'm', [3, 3, 4, 2, 3, 3, -1, 4], []],
  ['Zara Khan', 'Supervisor', 'Logistics', 'Logistics Hub', 'f', [4, 4, 4, 3, 4, 4, 3, 4], []],
  ['Arjun Mehta', 'Operator', 'Logistics', 'Warehouse', 'm', [2, 3, 4, 2, 3, 2, 2, 5], ['hi']],
  ['Sofia Rossi', 'Operator', 'Logistics', 'Warehouse', 'f', [3, 3, 3, 3, 3, 3, 2, 4], []],
  ['Ahmed Saleh', 'Driver', 'Logistics', 'Logistics Hub', 'm', [3, 2, 3, 2, 3, 3, -1, 3], ['fs']],
  ['Li Wei', 'Operator', 'Logistics', 'Warehouse', 'm', [4, 3, 5, 3, 4, 3, 3, 5], []],
  ['Hannah Lee', 'Safety Officer', 'Logistics', 'Logistics Hub', 'f', [5, 4, 3, 4, 5, 5, 4, -1], []],
  ['Emma Wilson', 'Operator', 'Logistics', 'Warehouse', 'f', [2, 2, 3, 2, 3, 2, 1, 3], ['wah']],
];
export const ROLES = [...new Set(MATRIX_ROWS.map((r) => r[1]))].sort();

const emailOf = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.') + '@people360.com';
export const MATRIX_SEED: TEmp[] = MATRIX_ROWS.map(([name, role, dept, site, g, lv, due, cap, scarf], i) => {
  const r = rng(i * 41 + 7);
  const levels: Record<string, number | null> = {};
  SAFETY.forEach((s, k) => (levels[s] = lv[k] < 0 ? null : lv[k]));
  for (const s of SKILL_SEED.filter((x) => x.category !== 'Safety')) {
    const tech = s.category === 'Technical';
    const relevant = !tech || ['Maintenance', 'Operations'].includes(dept);
    levels[s.id] = relevant ? Math.min(5, Math.max(1, Math.round(2.4 + r() * 2.6 + (role === 'Supervisor' ? 0.5 : 0)))) : null;
  }
  return {
    id: `EMP-${String(i + 1).padStart(3, '0')}`,
    name, role, dept, site, status: i === 21 ? 'On Leave' : 'Active',
    look: { g, skin: SKIN[(i * 3) % SKIN.length], hair: HAIR[(i * 7) % HAIR.length], uni: cap ? 'var(--ka-1e3a8a)' : UNI[i % UNI.length], cap, scarf },
    levels, due, joined: iso(-400 - i * 53), email: emailOf(name),
  };
});

/* ---------------- all 1,248 employees (for certs / enrollments) ---------------- */
const FIRST = ['Mohammed', 'Anil', 'Sanjay', 'Joseph', 'Khalid', 'Rahul', 'Mariam', 'Noura', 'Rashid', 'Suresh', 'Elena', 'Peter', 'Hassan', 'Deepa', 'Tariq', 'Anna', 'George', 'Salma', 'Karim', 'Rita', 'Imran', 'Leila', 'Victor', 'Jamal', 'Bilal', 'Asha', 'Paul', 'Reem', 'Faisal', 'Neha'];
const LAST = ['Al Mansoori', 'Pillai', 'Thomas', 'Fernandes', 'Ahmed', 'Gupta', 'Nasser', 'Joseph', 'Varghese', 'Hamdan', 'Petrov', 'Menon', 'Abbas', 'Rodrigues', 'Qureshi', 'Mathew', 'Osman', 'Reddy', 'Yilmaz', 'Daniel'];
const ROLE_BY_DEPT: Record<string, string[]> = {
  Operations: ['Technician', 'Operator', 'Supervisor', 'Safety Officer'],
  Maintenance: ['Technician', 'Electrician', 'Supervisor'],
  Security: ['Security Officer', 'Supervisor'],
  Logistics: ['Operator', 'Driver', 'Supervisor'],
  Facilities: ['Technician', 'Cleaner', 'Supervisor'],
  HSE: ['Safety Officer', 'HSE Manager'],
  Production: ['Operator', 'Technician', 'Supervisor'],
  Administration: ['Coordinator', 'Manager', 'Analyst'],
};
const AV = ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0d9488)', 'var(--ka-ca8a04)', 'var(--ka-db2777)', 'var(--ka-475569)', 'var(--ka-16a34a)', 'var(--ka-ea580c)'];
export interface Person {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  dept: string;
  role: string;
  site: string;
}
const pr = rng(2026);
const DEPT_W = [0.22, 0.13, 0.12, 0.14, 0.08, 0.05, 0.18, 0.08];
const pickDept = (x: number) => {
  let a = 0;
  for (let i = 0; i < DEPT_W.length; i++) if (x < (a += DEPT_W[i])) return DEPTS[i];
  return DEPTS[0];
};
export const PEOPLE: Person[] = Array.from({ length: TOTAL_EMPLOYEES }, (_, i) => {
  if (i < MATRIX_SEED.length) {
    const m = MATRIX_SEED[i];
    return { id: m.id, name: m.name, initials: ini(m.name), avatar: AV[i % AV.length], dept: m.dept, role: m.role, site: m.site };
  }
  const name = `${FIRST[Math.floor(pr() * FIRST.length)]} ${LAST[Math.floor(pr() * LAST.length)]}`;
  const dept = pickDept(pr());
  const roles = ROLE_BY_DEPT[dept];
  return { id: `EMP-${String(i + 1).padStart(3, '0')}`, name, initials: ini(name), avatar: AV[i % AV.length], dept, role: roles[Math.floor(pr() * roles.length)], site: SITES[Math.floor(pr() * SITES.length)] };
});
function ini(n: string) {
  return n.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
export const PERSON = new Map(PEOPLE.map((p) => [p.id, p]));
export const DEPT_COUNT = Object.fromEntries(DEPTS.map((d) => [d, PEOPLE.filter((p) => p.dept === d).length]));

/* ---------------- courses ---------------- */
export type Mode = 'Classroom' | 'E-learning' | 'Blended' | 'On-the-job';
export interface Course {
  id: string;
  title: string;
  category: Category;
  mode: Mode;
  hours: number;
  provider: string;
  skillId: string;
  mandatory: boolean;
  rating: number;
  capacity: number;
  color: string;
  icon: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  cost: number;
  desc: string;
}
const C = (id: string, title: string, category: Category, mode: Mode, hours: number, provider: string, skillId: string, mandatory: boolean, rating: number, level: Course['level'], cost: number, desc: string): Course => {
  const s = SKILL_SEED.find((x) => x.id === skillId)!;
  return { id, title, category, mode, hours, provider, skillId, mandatory, rating, capacity: mode === 'E-learning' ? 999 : 20, color: s.color, icon: s.icon, level, cost, desc };
};
export const COURSE_SEED: Course[] = [
  C('C-101', 'First Aid & CPR Certification', 'Safety', 'Classroom', 8, 'Red Crescent Training Institute', 'fa', true, 4.8, 'Beginner', 450, 'Primary assessment, CPR & AED use, bleeding control, burns, fractures and casualty handover. Leads to a 2-year First Aid certificate.'),
  C('C-102', 'Fire Safety & Extinguisher Use', 'Safety', 'Blended', 4, 'Civil Defence Academy', 'fs', true, 4.6, 'Beginner', 220, 'Fire triangle, classes of fire, extinguisher selection (PASS), alarm response and evacuation roles with live-fire practice.'),
  C('C-103', 'Equipment Operation Level 2', 'Safety', 'On-the-job', 16, 'Internal – Operations Academy', 'eo', true, 4.4, 'Intermediate', 300, 'Safe start-up, shutdown and isolation of production equipment, pre-use checks and fault reporting.'),
  C('C-104', 'Security Procedures & Access Control', 'Safety', 'E-learning', 3, 'Internal – Security Office', 'sp', true, 4.3, 'Beginner', 0, 'Badge policy, tailgating, visitor escort, suspicious item handling and incident reporting.'),
  C('C-105', 'Emergency Response Team (ERT)', 'Safety', 'Classroom', 12, 'Civil Defence Academy', 'er', true, 4.7, 'Intermediate', 520, 'ERT roles, muster accountability, search & rescue sweeps, coordination with emergency services.'),
  C('C-106', 'Hazard Identification & Risk Assessment', 'Safety', 'Blended', 6, 'NEBOSH Partner – SafeWorks', 'hi', true, 4.5, 'Intermediate', 380, 'HIRA methodology, hierarchy of controls, job safety analysis and risk registers.'),
  C('C-107', 'Working at Height & Harness Safety', 'Safety', 'Classroom', 8, 'SafeWorks Training Centre', 'wah', true, 4.6, 'Intermediate', 410, 'Fall protection, harness inspection, anchor points, ladders, MEWPs and rescue planning.'),
  C('C-108', 'Forklift Operator Licence', 'Safety', 'Blended', 16, 'Lift Masters Academy', 'fl', true, 4.7, 'Intermediate', 650, 'Counterbalance & reach trucks, load charts, pedestrian safety and practical driving test.'),
  C('C-109', 'Confined Space Entry', 'Safety', 'Classroom', 8, 'SafeWorks Training Centre', 'hi', true, 4.5, 'Advanced', 480, 'Permit-to-enter, atmospheric testing, attendant duties and rescue arrangements.'),
  C('C-110', 'Hazardous Material Handling (COSHH)', 'Safety', 'E-learning', 4, 'Internal – HSE', 'hi', true, 4.2, 'Beginner', 0, 'Safety data sheets, labelling, storage, spill response and PPE selection.'),
  C('C-111', 'Lockout / Tagout (LOTO)', 'Safety', 'Classroom', 6, 'Internal – Maintenance', 'em', true, 4.6, 'Intermediate', 200, 'Energy isolation, lock & tag application, verification and group lockout.'),
  C('C-112', 'Manual Handling', 'Safety', 'E-learning', 2, 'Internal – HSE', 'hi', true, 4.1, 'Beginner', 0, 'TILE assessment, lifting technique, team lifts and mechanical aids.'),
  C('C-201', 'Electrical Maintenance Fundamentals', 'Technical', 'Classroom', 24, 'Siemens Training', 'em', false, 4.5, 'Intermediate', 1200, 'LV systems, testing instruments, motor control circuits and preventive maintenance.'),
  C('C-202', 'PLC Programming (S7)', 'Technical', 'Blended', 32, 'Siemens Training', 'plc', false, 4.8, 'Advanced', 2400, 'Ladder logic, function blocks, HMI integration and troubleshooting.'),
  C('C-203', 'MIG / TIG Welding', 'Technical', 'On-the-job', 40, 'Gulf Welding Institute', 'wd', false, 4.4, 'Intermediate', 1800, 'Joint preparation, MIG & TIG practice, weld inspection and hot-work safety.'),
  C('C-204', 'HVAC Systems Servicing', 'Technical', 'Classroom', 16, 'Carrier Academy', 'hv', false, 4.3, 'Intermediate', 900, 'Refrigeration cycle, chillers, AHUs, BMS points and F-gas handling.'),
  C('C-205', 'Quality Inspection & SPC', 'Technical', 'E-learning', 8, 'ASQ Online', 'qi', false, 4.2, 'Intermediate', 350, 'Sampling plans, control charts, measurement systems and non-conformance reporting.'),
  C('C-301', 'Frontline Leadership', 'Soft Skills', 'Classroom', 12, 'People360 Academy', 'ld', false, 4.7, 'Intermediate', 750, 'Leading shifts, coaching conversations, delegation and performance feedback.'),
  C('C-302', 'Effective Communication', 'Soft Skills', 'E-learning', 3, 'People360 Academy', 'cm', false, 4.4, 'Beginner', 0, 'Active listening, shift handovers, radio etiquette and written reports.'),
  C('C-303', 'Customer Service Excellence', 'Soft Skills', 'Blended', 6, 'People360 Academy', 'cs', false, 4.3, 'Beginner', 260, 'Visitor experience, complaint handling and service recovery.'),
  C('C-304', 'Root Cause Problem Solving', 'Soft Skills', 'Classroom', 8, 'Lean Institute', 'ps', false, 4.6, 'Intermediate', 420, '5 Whys, fishbone, A3 thinking and corrective action tracking.'),
  C('C-401', 'Data Privacy & Protection', 'Compliance', 'E-learning', 1, 'Internal – Legal', 'dp', true, 4.0, 'Beginner', 0, 'Personal data handling, retention, breach reporting and privacy by design.'),
  C('C-402', 'Anti-Bribery & Corruption', 'Compliance', 'E-learning', 1, 'Internal – Legal', 'ab', true, 4.1, 'Beginner', 0, 'Gifts & hospitality, conflicts of interest and speak-up channels.'),
  C('C-403', 'Code of Conduct', 'Compliance', 'E-learning', 1, 'Internal – HR', 'cc', true, 4.2, 'Beginner', 0, 'Company values, respectful workplace and ethical decision making.'),
  C('C-404', 'ISO 45001 Awareness', 'Compliance', 'E-learning', 2, 'BSI Online', 'iso', true, 4.3, 'Beginner', 120, 'OH&S management system, worker participation and incident investigation.'),
  C('C-405', 'Environmental Awareness (ISO 14001)', 'Compliance', 'E-learning', 2, 'BSI Online', 'env', false, 4.1, 'Beginner', 120, 'Aspects & impacts, waste segregation and spill prevention.'),
];

export interface Session {
  id: string;
  courseId: string;
  date: string;
  time: string;
  trainer: string;
  location: string;
  seats: number;
  booked: number;
}
const TRAINERS = ['Dr. Samir Aziz', 'Linda Morris', 'Capt. Rashid Omar', 'Peter Novak', 'Anjali Desai', 'Mark Evans'];
const ROOMS = ['Training Room A – Head Office', 'Training Room B – Head Office', 'Safety Yard – Manufacturing', 'Online (Teams)', 'Warehouse Bay 3', 'Logistics Hub – Room 2'];
export const SESSION_SEED: Session[] = COURSE_SEED.filter((c) => c.mode !== 'E-learning').flatMap((c, i) =>
  [0, 1].map((k) => ({
    id: `S-${c.id.slice(2)}-${k + 1}`,
    courseId: c.id,
    date: iso(2 + ((i * 3 + k * 9) % 26)),
    time: k ? '13:30 – 17:30' : '09:00 – 13:00',
    trainer: TRAINERS[(i + k) % TRAINERS.length],
    location: ROOMS[(i * 2 + k) % ROOMS.length],
    seats: 20,
    booked: 8 + ((i * 7 + k * 5) % 12),
  })),
).sort((a, b) => a.date.localeCompare(b.date));

/* ---------------- certifications ---------------- */
export interface CertType {
  id: string;
  name: string;
  skillId: string;
  courseId: string;
  issuer: string;
  months: number;
  /** due within the window (days) */
  due: number;
  window: number;
  expired: number;
  later: number; // 31–90 days
  valid: number;
  licence?: boolean;
}
export const CERT_TYPES: CertType[] = [
  { id: 'ct-fa', name: 'First Aid Certification', skillId: 'fa', courseId: 'C-101', issuer: 'Red Crescent Training Institute', months: 24, due: 25, window: 7, expired: 9, later: 21, valid: 640 },
  { id: 'ct-fs', name: 'Fire Safety Training', skillId: 'fs', courseId: 'C-102', issuer: 'Civil Defence Academy', months: 12, due: 18, window: 14, expired: 7, later: 30, valid: 820 },
  { id: 'ct-wah', name: 'Working at Height', skillId: 'wah', courseId: 'C-107', issuer: 'SafeWorks Training Centre', months: 24, due: 12, window: 21, expired: 5, later: 14, valid: 260 },
  { id: 'ct-fl', name: 'Forklift Operation', skillId: 'fl', courseId: 'C-108', issuer: 'Lift Masters Academy', months: 36, due: 10, window: 21, expired: 3, later: 9, valid: 168, licence: true },
  { id: 'ct-cs', name: 'Confined Space Entry', skillId: 'hi', courseId: 'C-109', issuer: 'SafeWorks Training Centre', months: 24, due: 8, window: 30, expired: 4, later: 6, valid: 96 },
  { id: 'ct-hm', name: 'Hazardous Material Handling', skillId: 'hi', courseId: 'C-110', issuer: 'Internal – HSE', months: 24, due: 7, window: 30, expired: 2, later: 8, valid: 140 },
  { id: 'ct-es', name: 'Electrical Safety (LOTO)', skillId: 'em', courseId: 'C-111', issuer: 'Internal – Maintenance', months: 12, due: 7, window: 30, expired: 3, later: 6, valid: 120 },
  { id: 'ct-sc', name: 'Scaffolding Inspection', skillId: 'wah', courseId: 'C-107', issuer: 'CITB Middle East', months: 36, due: 7, window: 30, expired: 2, later: 4, valid: 54 },
  { id: 'ct-cr', name: 'Crane & Rigging Licence', skillId: 'eo', courseId: 'C-103', issuer: 'Lift Masters Academy', months: 24, due: 7, window: 30, expired: 1, later: 3, valid: 38, licence: true },
  { id: 'ct-sg', name: 'Security Guard Licence (SIRA)', skillId: 'sp', courseId: 'C-104', issuer: 'Security Industry Regulatory Agency', months: 12, due: 6, window: 30, expired: 2, later: 11, valid: 132, licence: true },
  { id: 'ct-fh', name: 'Food Hygiene Level 2', skillId: 'cs', courseId: 'C-303', issuer: 'Municipality Food Safety Dept.', months: 24, due: 6, window: 30, expired: 1, later: 3, valid: 42 },
  { id: 'ct-dd', name: 'Defensive Driving', skillId: 'eo', courseId: 'C-103', issuer: 'RTA Driving Institute', months: 24, due: 6, window: 30, expired: 2, later: 5, valid: 77 },
  { id: 'ct-iso', name: 'ISO 45001 Internal Auditor', skillId: 'iso', courseId: 'C-404', issuer: 'BSI Group', months: 36, due: 6, window: 30, expired: 0, later: 2, valid: 24 },
  { id: 'ct-mh', name: 'Manual Handling', skillId: 'hi', courseId: 'C-112', issuer: 'Internal – HSE', months: 24, due: 6, window: 30, expired: 4, later: 12, valid: 410 },
  { id: 'ct-ptw', name: 'Permit to Work Issuer', skillId: 'hi', courseId: 'C-106', issuer: 'Internal – HSE', months: 12, due: 6, window: 30, expired: 1, later: 2, valid: 36 },
  { id: 'ct-gt', name: 'Gas Testing', skillId: 'hi', courseId: 'C-109', issuer: 'SafeWorks Training Centre', months: 12, due: 5, window: 30, expired: 1, later: 3, valid: 31 },
];
export const CT = new Map(CERT_TYPES.map((t) => [t.id, t]));
export interface Cert {
  id: string;
  empId: string;
  typeId: string;
  number: string;
  issued: string;
  expiry: string;
  verified: boolean;
  revoked?: boolean;
  reminded?: number;
  snoozed?: boolean;
}
function genCerts(): Cert[] {
  const out: Cert[] = [];
  CERT_TYPES.forEach((t, ti) => {
    const r = rng(ti * 131 + 5);
    const days: number[] = [];
    const lo = t.window <= 7 ? 1 : t.window <= 14 ? 8 : t.window <= 21 ? 15 : 22;
    for (let k = 0; k < t.due; k++) days.push(lo + Math.floor(r() * (t.window - lo + 1)));
    for (let k = 0; k < t.expired; k++) days.push(-1 - Math.floor(r() * 75));
    for (let k = 0; k < t.later; k++) days.push(31 + Math.floor(r() * 60));
    for (let k = 0; k < t.valid; k++) days.push(91 + Math.floor(r() * (t.months * 30 - 100)));
    days.forEach((d, j) => {
      const emp = (ti * 97 + 1 + j * 53) % TOTAL_EMPLOYEES;
      const expiry = iso(d);
      out.push({ id: `CRT-${String(out.length + 10001)}`, empId: PEOPLE[emp].id, typeId: t.id, number: `${t.id.slice(3).toUpperCase()}-${26000 + out.length}`, issued: addMonths(expiry, -t.months), expiry, verified: (j + ti) % 9 !== 0 });
    });
  });
  // Ahmed Hassan (EMP-001): First Aid & Forklift valid, Fire Safety due in 12 days.
  const pin = (type: string, pred: (d: number) => boolean) => {
    const c = out.find((x) => x.typeId === type && pred(daysUntil(x.expiry)));
    const other = out.find((x) => x.typeId === type && x.empId === 'EMP-001');
    if (c && other && other !== c) other.empId = c.empId;
    if (c) c.empId = 'EMP-001';
  };
  pin('ct-fa', (d) => d > 200);
  pin('ct-fs', (d) => d >= 8 && d <= 14);
  pin('ct-fl', (d) => d > 300);
  return out;
}
export const CERT_SEED = genCerts();
export const certStatus = (c: Cert) => {
  if (c.revoked) return 'Revoked';
  const d = daysUntil(c.expiry);
  return d < 0 ? 'Expired' : d <= 30 ? 'Expiring' : 'Valid';
};

/* ---------------- enrollments ---------------- */
export type EStatus = 'Enrolled' | 'In Progress' | 'Completed' | 'Overdue' | 'Waitlisted';
export interface Enrollment {
  id: string;
  empId: string;
  courseId: string;
  status: EStatus;
  progress: number;
  enrolled: string;
  due: string;
  score?: number;
  source: 'Manager' | 'Self' | 'Auto (Renewal)' | 'Learning Path' | 'Compliance';
}
function genEnroll(): Enrollment[] {
  const r = rng(77);
  const st: [EStatus, number][] = [['In Progress', 92], ['Enrolled', 74], ['Completed', 86], ['Overdue', 21], ['Waitlisted', 13]];
  const srcs: Enrollment['source'][] = ['Manager', 'Self', 'Auto (Renewal)', 'Learning Path', 'Compliance'];
  const out: Enrollment[] = [
    { id: 'ENR-5001', empId: 'EMP-001', courseId: 'C-102', status: 'In Progress', progress: 40, enrolled: iso(-9), due: iso(12), source: 'Auto (Renewal)' },
    { id: 'ENR-5002', empId: 'EMP-001', courseId: 'C-107', status: 'Enrolled', progress: 0, enrolled: iso(-3), due: iso(21), source: 'Manager' },
    { id: 'ENR-5003', empId: 'EMP-001', courseId: 'C-103', status: 'In Progress', progress: 65, enrolled: iso(-20), due: iso(9), source: 'Learning Path' },
    { id: 'ENR-5004', empId: 'EMP-001', courseId: 'C-101', status: 'Completed', progress: 100, enrolled: iso(-260), due: iso(-230), score: 92, source: 'Compliance' },
    { id: 'ENR-5005', empId: 'EMP-001', courseId: 'C-104', status: 'Completed', progress: 100, enrolled: iso(-150), due: iso(-120), score: 84, source: 'Compliance' },
  ];
  let n = out.length;
  for (const [status, count] of st)
    for (let k = 0; k < count; k++) {
      const emp = PEOPLE[1 + Math.floor(r() * (TOTAL_EMPLOYEES - 1))];
      const c = COURSE_SEED[Math.floor(r() * COURSE_SEED.length)];
      const start = -Math.floor(r() * 60) - (status === 'Completed' ? 20 : 0);
      const due = status === 'Overdue' ? -1 - Math.floor(r() * 20) : status === 'Completed' ? start + 14 : 3 + Math.floor(r() * 45);
      out.push({
        id: `ENR-${5001 + n++}`, empId: emp.id, courseId: c.id, status,
        progress: status === 'Completed' ? 100 : status === 'In Progress' ? 10 + Math.floor(r() * 85) : status === 'Overdue' ? Math.floor(r() * 60) : 0,
        enrolled: iso(start), due: iso(due), score: status === 'Completed' ? 70 + Math.floor(r() * 30) : undefined, source: srcs[Math.floor(r() * srcs.length)],
      });
    }
  return out;
}
export const ENROLL_SEED = genEnroll();

/* ---------------- learning paths ---------------- */
export interface LPath {
  id: string;
  name: string;
  audience: string;
  color: string;
  icon: string;
  steps: string[];
  learners: { empId: string; done: number; started: string }[];
  mandatory: boolean;
  owner: string;
}
function learners(seed: number, n: number, steps: number, first: string[] = []) {
  const r = rng(seed);
  const ids = [...first];
  while (ids.length < n) {
    const p = PEOPLE[Math.floor(r() * TOTAL_EMPLOYEES)].id;
    if (!ids.includes(p)) ids.push(p);
  }
  return ids.map((empId, i) => ({ empId, done: i < first.length ? Math.min(steps, 2) : Math.floor(r() * (steps + 1)), started: iso(-5 - Math.floor(r() * 120)) }));
}
export const PATH_SEED: LPath[] = [
  { id: 'LP-01', name: 'New Technician Onboarding', audience: 'Technicians (first 90 days)', color: 'var(--ka-7c3aed)', icon: 'training-helmet', steps: ['C-403', 'C-104', 'C-102', 'C-101', 'C-103', 'C-111'], learners: learners(11, 28, 6, ['EMP-001', 'EMP-005']), mandatory: true, owner: 'Maria Santos' },
  { id: 'LP-02', name: 'Forklift Operator Certification', audience: 'Warehouse & Logistics operators', color: 'var(--ka-f59e0b)', icon: 'training-forklift', steps: ['C-112', 'C-106', 'C-108'], learners: learners(12, 18, 3, ['EMP-007', 'EMP-027']), mandatory: true, owner: 'Zara Khan' },
  { id: 'LP-03', name: 'Emergency Response Team', audience: 'Floor wardens & ERT members', color: 'var(--ka-ef4444)', icon: 'run', steps: ['C-101', 'C-102', 'C-105', 'C-109'], learners: learners(13, 22, 4, ['EMP-002', 'EMP-006']), mandatory: false, owner: 'Priya Sharma' },
  { id: 'LP-04', name: 'Supervisor Leadership Track', audience: 'New & aspiring supervisors', color: 'var(--ka-2563eb)', icon: 'star', steps: ['C-302', 'C-301', 'C-304', 'C-106', 'C-404'], learners: learners(14, 15, 5, ['EMP-004', 'EMP-008']), mandatory: false, owner: 'HR – Talent' },
  { id: 'LP-05', name: 'Working at Height Competency', audience: 'Maintenance & facilities', color: 'var(--ka-0f766e)', icon: 'training-climb', steps: ['C-106', 'C-107', 'C-109'], learners: learners(15, 19, 3, ['EMP-001', 'EMP-016']), mandatory: true, owner: 'Meera Iyer' },
  { id: 'LP-06', name: 'Compliance Essentials (Annual)', audience: 'All employees', color: 'var(--ka-475569)', icon: 'file-check', steps: ['C-403', 'C-401', 'C-402', 'C-404'], learners: learners(16, 40, 4), mandatory: true, owner: 'Compliance Office' },
];

/* ---------------- compliance requirements ---------------- */
export interface Req {
  id: string;
  name: string;
  regulation: string;
  appliesTo: string;
  typeId?: string;
  courseId: string;
  required: number;
  /** employees who never trained (beyond expired certs) */
  missing: number;
  frequency: string;
  owner: string;
}
export const REQS: Req[] = [
  { id: 'RQ-01', name: 'First Aid coverage (1 per 25 staff)', regulation: 'OSHA 1910.151', appliesTo: 'All sites', typeId: 'ct-fa', courseId: 'C-101', required: 702, missing: 22, frequency: 'Every 2 years', owner: 'HSE' },
  { id: 'RQ-02', name: 'Fire Safety Awareness', regulation: 'Civil Defence Code §4.2', appliesTo: 'All employees', typeId: 'ct-fs', courseId: 'C-102', required: 893, missing: 38, frequency: 'Annual', owner: 'HSE' },
  { id: 'RQ-03', name: 'Working at Height authorisation', regulation: 'ISO 45001 §8.1.2', appliesTo: 'Maintenance, Facilities', typeId: 'ct-wah', courseId: 'C-107', required: 300, missing: 12, frequency: 'Every 2 years', owner: 'Maintenance' },
  { id: 'RQ-04', name: 'Forklift licence for MHE drivers', regulation: 'OSHA 1910.178', appliesTo: 'Logistics, Production', typeId: 'ct-fl', courseId: 'C-108', required: 190, missing: 6, frequency: 'Every 3 years', owner: 'Logistics' },
  { id: 'RQ-05', name: 'Confined Space entrant & attendant', regulation: 'OSHA 1910.146', appliesTo: 'Maintenance', typeId: 'ct-cs', courseId: 'C-109', required: 114, missing: 9, frequency: 'Every 2 years', owner: 'HSE' },
  { id: 'RQ-06', name: 'Security guard licensing', regulation: 'SIRA Regulation 2024', appliesTo: 'Security', typeId: 'ct-sg', courseId: 'C-104', required: 151, missing: 5, frequency: 'Annual', owner: 'Security' },
  { id: 'RQ-07', name: 'Lockout / Tagout qualified persons', regulation: 'OSHA 1910.147', appliesTo: 'Maintenance, Production', typeId: 'ct-es', courseId: 'C-111', required: 136, missing: 8, frequency: 'Annual', owner: 'Maintenance' },
  { id: 'RQ-08', name: 'Code of Conduct acknowledgement', regulation: 'Corporate Policy CP-01', appliesTo: 'All employees', courseId: 'C-403', required: 1248, missing: 96, frequency: 'Annual', owner: 'HR' },
  { id: 'RQ-09', name: 'Data Privacy training', regulation: 'PDPL Art. 19', appliesTo: 'All employees', courseId: 'C-401', required: 1248, missing: 142, frequency: 'Annual', owner: 'Legal' },
  { id: 'RQ-10', name: 'Manual Handling', regulation: 'ISO 45001 §8.1', appliesTo: 'Operations, Logistics, Production', typeId: 'ct-mh', courseId: 'C-112', required: 432, missing: 24, frequency: 'Every 2 years', owner: 'HSE' },
];

/* ---------------- assessments ---------------- */
export interface Question {
  q: string;
  options: string[];
  answer: number;
  why: string;
}
export interface Quiz {
  id: string;
  title: string;
  skillId: string;
  courseId: string;
  pass: number;
  minutes: number;
  questions: Question[];
}
export const QUIZZES: Quiz[] = [
  { id: 'Q-101', title: 'First Aid & CPR Knowledge Check', skillId: 'fa', courseId: 'C-101', pass: 80, minutes: 10, questions: [
    { q: 'What is the correct compression-to-breath ratio for adult CPR?', options: ['15:2', '30:2', '5:1', '20:2'], answer: 1, why: 'Current guidelines use 30 compressions followed by 2 rescue breaths.' },
    { q: 'What is the first thing to do when you find a casualty?', options: ['Start CPR immediately', 'Check for danger to yourself and others', 'Move the casualty', 'Give them water'], answer: 1, why: 'DR ABC — always check Danger first so you do not become a second casualty.' },
    { q: 'How should severe external bleeding be controlled?', options: ['Apply direct pressure to the wound', 'Raise the legs only', 'Apply ice', 'Wait for the ambulance'], answer: 0, why: 'Firm direct pressure with a dressing is the primary control for severe bleeding.' },
    { q: 'At what rate should chest compressions be delivered?', options: ['60–80 per minute', '80–100 per minute', '100–120 per minute', '140–160 per minute'], answer: 2, why: 'Compress at 100–120 per minute, 5–6 cm deep for adults.' },
    { q: 'A minor burn should be cooled under running water for at least…', options: ['1 minute', '5 minutes', '20 minutes', 'It should not be cooled'], answer: 2, why: 'Cool burns with cool running water for at least 20 minutes.' },
  ] },
  { id: 'Q-102', title: 'Fire Safety & Extinguishers', skillId: 'fs', courseId: 'C-102', pass: 80, minutes: 8, questions: [
    { q: 'What does the PASS technique stand for?', options: ['Pull, Aim, Squeeze, Sweep', 'Push, Aim, Spray, Stop', 'Pull, Alert, Spray, Sweep', 'Point, Aim, Squeeze, Shoot'], answer: 0, why: 'Pull the pin, Aim at the base, Squeeze the handle, Sweep side to side.' },
    { q: 'Which extinguisher should be used on an electrical fire?', options: ['Water', 'Foam', 'CO₂', 'Wet chemical'], answer: 2, why: 'CO₂ is non-conductive and leaves no residue on electrical equipment.' },
    { q: 'What are the three elements of the fire triangle?', options: ['Heat, fuel, oxygen', 'Smoke, heat, fuel', 'Spark, gas, air', 'Oxygen, water, heat'], answer: 0, why: 'Remove any one of heat, fuel or oxygen and the fire goes out.' },
    { q: 'When the fire alarm sounds you should first…', options: ['Collect your belongings', 'Use the lift to exit quickly', 'Leave by the nearest safe exit and go to the muster point', 'Finish your task'], answer: 2, why: 'Evacuate immediately by the nearest safe route — never use lifts.' },
    { q: 'Class B fires involve…', options: ['Wood and paper', 'Flammable liquids', 'Metals', 'Cooking oils'], answer: 1, why: 'Class B = flammable liquids such as petrol, solvents and paints.' },
  ] },
  { id: 'Q-107', title: 'Working at Height Safety', skillId: 'wah', courseId: 'C-107', pass: 80, minutes: 10, questions: [
    { q: 'Above what height is fall protection generally required?', options: ['0.5 m', '1.8 m', '4 m', '6 m'], answer: 1, why: 'Fall protection is required for work at 1.8 m (6 ft) or more.' },
    { q: 'When must a full-body harness be inspected?', options: ['Once a year only', 'Before every use', 'Only after a fall', 'Never by the user'], answer: 1, why: 'Users must carry out a pre-use inspection every time.' },
    { q: 'What is the preferred order of control for work at height?', options: ['Use PPE first', 'Avoid → prevent → minimise', 'Minimise → prevent → avoid', 'Training only'], answer: 1, why: 'Avoid work at height where possible, then prevent falls, then minimise consequences.' },
    { q: 'A ladder should be set at what angle?', options: ['45°', '60°', '75° (1 out : 4 up)', '90°'], answer: 2, why: 'The 1-in-4 rule gives roughly a 75° angle.' },
    { q: 'Who needs a rescue plan?', options: ['Only scaffolders', 'Any work where a fall arrest system is used', 'Only work above 10 m', 'Nobody'], answer: 1, why: 'Suspension trauma means a rescue plan is required whenever fall arrest is used.' },
  ] },
  { id: 'Q-108', title: 'Forklift Operator Theory', skillId: 'fl', courseId: 'C-108', pass: 85, minutes: 12, questions: [
    { q: 'Where should the load be carried when travelling?', options: ['Raised high for visibility', 'Low, tilted back', 'Tilted forward', 'At eye level'], answer: 1, why: 'Carry loads low (about 15 cm) and tilted back for stability.' },
    { q: 'When travelling down a ramp with a load, the load should face…', options: ['Downhill', 'Uphill', 'Sideways', 'It does not matter'], answer: 1, why: 'Keep the load on the uphill side to prevent it sliding off.' },
    { q: 'What must be done before operating a forklift each shift?', options: ['Nothing', 'Pre-use inspection checklist', 'Call the supervisor', 'Charge the battery to 50%'], answer: 1, why: 'A documented pre-use check is mandatory every shift.' },
    { q: 'The load chart tells you…', options: ['Fuel consumption', 'Maximum safe capacity at load centre and lift height', 'Service intervals', 'Travel speed'], answer: 1, why: 'Capacity reduces as load centre and lift height increase.' },
    { q: 'Passengers may ride on a forklift when…', options: ['They hold on tight', 'Never, unless a seat is fitted', 'Travelling slowly', 'Supervisor approves'], answer: 1, why: 'No passengers unless the truck has a designated seat.' },
  ] },
  { id: 'Q-106', title: 'Hazard Identification (HIRA)', skillId: 'hi', courseId: 'C-106', pass: 75, minutes: 10, questions: [
    { q: 'Risk is a combination of…', options: ['Cost and time', 'Likelihood and severity', 'Hazard and PPE', 'People and places'], answer: 1, why: 'Risk = likelihood × severity of harm.' },
    { q: 'Which control is most effective?', options: ['PPE', 'Administrative controls', 'Elimination', 'Signage'], answer: 2, why: 'Elimination sits at the top of the hierarchy of controls.' },
    { q: 'A wet floor in a corridor is an example of a…', options: ['Risk', 'Hazard', 'Control', 'Near miss'], answer: 1, why: 'A hazard is anything with the potential to cause harm.' },
    { q: 'An event that could have caused injury but did not is a…', options: ['Near miss', 'Lost time injury', 'Audit', 'Permit'], answer: 0, why: 'Near misses should be reported — they are free lessons.' },
    { q: 'Risk assessments should be reviewed…', options: ['Never', 'When work, people or equipment change', 'Every 10 years', 'Only after an accident'], answer: 1, why: 'Review on change, after incidents and at a set interval.' },
  ] },
  { id: 'Q-104', title: 'Security Procedures', skillId: 'sp', courseId: 'C-104', pass: 80, minutes: 6, questions: [
    { q: 'Someone without a badge follows you through a secure door. You should…', options: ['Ignore it', 'Politely challenge and direct them to reception', 'Hold the door', 'Report it next week'], answer: 1, why: 'Tailgating must be challenged politely and reported.' },
    { q: 'Visitors must be…', options: ['Left to find their way', 'Escorted at all times in restricted areas', 'Given an employee badge', 'Allowed in after 6 pm'], answer: 1, why: 'Escort visitors in all restricted zones.' },
    { q: 'You find an unattended bag in the lobby. First action?', options: ['Open it', 'Move it outside', 'Do not touch it, report to security', 'Throw it away'], answer: 2, why: 'Never touch suspicious items — report immediately.' },
    { q: 'Lost access cards must be reported…', options: ['Immediately', 'Within a week', 'At the annual review', 'Not at all'], answer: 0, why: 'Immediate reporting lets security disable the card.' },
    { q: 'Passwords should be…', options: ['Shared with your team', 'Written on the monitor', 'Kept private and unique', 'The same everywhere'], answer: 2, why: 'Credentials are personal and must never be shared.' },
  ] },
];
export interface Attempt {
  id: string;
  quizId: string;
  empId: string;
  score: number;
  passed: boolean;
  at: string;
  mins: number;
}
const ar = rng(404);
export const ATTEMPT_SEED: Attempt[] = Array.from({ length: 64 }, (_, i) => {
  const q = QUIZZES[i % QUIZZES.length];
  const score = Math.min(100, 60 + Math.floor(Math.sqrt(ar()) * 41));
  return { id: `ATT-${7001 + i}`, quizId: q.id, empId: PEOPLE[(i * 19 + 3) % 200].id, score, passed: score >= q.pass, at: iso(-Math.floor(ar() * 40)), mins: 4 + Math.floor(ar() * 9) };
}).sort((a, b) => b.at.localeCompare(a.at));

export interface PracticalEval {
  id: string;
  empId: string;
  skillId: string;
  assessor: string;
  due: string;
  status: 'Pending' | 'Completed';
  rating?: number;
}
export const EVAL_SEED: PracticalEval[] = [
  { id: 'PE-301', empId: 'EMP-001', skillId: 'wah', assessor: 'Meera Iyer', due: iso(3), status: 'Pending' },
  { id: 'PE-302', empId: 'EMP-005', skillId: 'fa', assessor: 'Priya Sharma', due: iso(1), status: 'Pending' },
  { id: 'PE-303', empId: 'EMP-003', skillId: 'sp', assessor: 'James Carter', due: iso(5), status: 'Pending' },
  { id: 'PE-304', empId: 'EMP-007', skillId: 'wah', assessor: 'Meera Iyer', due: iso(6), status: 'Pending' },
  { id: 'PE-305', empId: 'EMP-016', skillId: 'fs', assessor: 'Fatima Ali', due: iso(2), status: 'Pending' },
  { id: 'PE-306', empId: 'EMP-024', skillId: 'fa', assessor: 'Priya Sharma', due: iso(8), status: 'Pending' },
  { id: 'PE-307', empId: 'EMP-027', skillId: 'hi', assessor: 'Hannah Lee', due: iso(4), status: 'Pending' },
  { id: 'PE-308', empId: 'EMP-032', skillId: 'eo', assessor: 'Zara Khan', due: iso(9), status: 'Pending' },
  { id: 'PE-290', empId: 'EMP-002', skillId: 'er', assessor: 'David Lee', due: iso(-6), status: 'Completed', rating: 5 },
  { id: 'PE-291', empId: 'EMP-014', skillId: 'wah', assessor: 'Meera Iyer', due: iso(-11), status: 'Completed', rating: 5 },
  { id: 'PE-292', empId: 'EMP-030', skillId: 'fl', assessor: 'Zara Khan', due: iso(-15), status: 'Completed', rating: 5 },
];

/* ---------------- monthly history for reports ---------------- */
export const MONTHS_12 = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
export const HOURS_BY_MONTH = [1820, 2140, 2380, 2610, 2290, 2470, 1980, 1760, 2240, 2690, 2860, 1240];
export const COMPLETION_TREND = [78, 80, 81, 83, 82, 84, 85, 84, 86, 87, 88, 89];
export const COMPLIANCE_TREND = [86, 87, 87, 88, 89, 89, 90, 90, 91, 91, 92, 92];

export interface LogEntry {
  at: string;
  text: string;
  by: string;
  empId?: string;
}

/* ---------------- compliance model ---------------- */
/** Departments a requirement applies to (parsed from `appliesTo`). */
export const reqDepts = (r: Req) => (/^All/.test(r.appliesTo) ? DEPTS : r.appliesTo.split(',').map((x) => x.trim()));
/** Employees who never completed the requirement (deterministic per requirement). */
export const NEVER_TRAINED: Record<string, string[]> = Object.fromEntries(
  REQS.map((q, qi) => {
    const r = rng(qi * 613 + 29);
    const pool = PEOPLE.filter((p, i) => i > 0 && reqDepts(q).includes(p.dept));
    const ids = new Set<string>();
    while (ids.size < q.missing) ids.add(pool[Math.floor(r() * pool.length)].id);
    return [q.id, [...ids]];
  }),
);
const NEVER_SINCE: Record<string, number> = Object.fromEntries(REQS.map((q, i) => [q.id, 20 + i * 9]));
export type NcReason = 'Certificate expired' | 'Training overdue' | 'Never trained';
export interface NcRow {
  id: string;
  reqId: string;
  empId: string;
  reason: NcReason;
  /** date the gap started */
  since: string;
  /** cert / enrollment id behind the gap */
  ref?: string;
}

/* ---------------- renewal alert rules ---------------- */
export interface AlertRule {
  id: string;
  name: string;
  scope: string; // 'All' or cert type id
  days: number;
  channels: string[];
  recipients: string[];
  enabled: boolean;
  autoEnroll: boolean;
  lastRun?: string;
  fired: number;
}
export const RULE_SEED: AlertRule[] = [
  { id: 'AR-1', name: '90-day early notice', scope: 'All', days: 90, channels: ['Email'], recipients: ['Employee'], enabled: true, autoEnroll: false, lastRun: iso(-1) + ' 06:00', fired: 412 },
  { id: 'AR-2', name: '60-day manager heads-up', scope: 'All', days: 60, channels: ['Email', 'In-app'], recipients: ['Employee', 'Line Manager'], enabled: true, autoEnroll: false, lastRun: iso(-1) + ' 06:00', fired: 268 },
  { id: 'AR-3', name: '30-day renewal + auto-enrol', scope: 'All', days: 30, channels: ['Email', 'SMS', 'In-app'], recipients: ['Employee', 'Line Manager'], enabled: true, autoEnroll: true, lastRun: iso(-1) + ' 06:00', fired: 191 },
  { id: 'AR-4', name: 'Licence 14-day escalation', scope: 'ct-fl', days: 14, channels: ['SMS', 'Email'], recipients: ['Employee', 'Line Manager', 'HSE'], enabled: true, autoEnroll: false, lastRun: iso(-1) + ' 06:00', fired: 37 },
  { id: 'AR-5', name: 'Expired – stop work notice', scope: 'All', days: 0, channels: ['Email', 'SMS'], recipients: ['Employee', 'Line Manager', 'HSE'], enabled: true, autoEnroll: false, lastRun: iso(-1) + ' 06:00', fired: 54 },
  { id: 'AR-6', name: 'Security licence weekly digest', scope: 'ct-sg', days: 45, channels: ['Email'], recipients: ['Security Manager'], enabled: false, autoEnroll: false, fired: 12 },
];
export interface AlertEvent {
  at: string;
  text: string;
  kind: 'reminder' | 'rule' | 'renewal' | 'schedule';
}

/* ---------------- scheduled reports ---------------- */
export interface SchedReport {
  id: string;
  reportId: string;
  frequency: string;
  recipients: string;
  format: string;
  next: string;
  active: boolean;
}
export const SCHED_SEED: SchedReport[] = [
  { id: 'SR-1', reportId: 'compliance', frequency: 'Weekly (Mon)', recipients: 'hse-team@people360.com', format: 'CSV', next: iso(3), active: true },
  { id: 'SR-2', reportId: 'expiry', frequency: 'Daily', recipients: 'site-managers@people360.com', format: 'CSV', next: iso(1), active: true },
  { id: 'SR-3', reportId: 'spend', frequency: 'Monthly (1st)', recipients: 'finance@people360.com', format: 'Excel', next: iso(25), active: true },
  { id: 'SR-4', reportId: 'gap', frequency: 'Quarterly', recipients: 'hr-talent@people360.com', format: 'PDF', next: iso(56), active: false },
];

/* ================= store ================= */
@Injectable({ providedIn: 'root' })
export class TrainingStore {
  readonly skills = signal<Skill[]>(SKILL_SEED.map((s) => ({ ...s })));
  readonly emps = signal<TEmp[]>(clone(MATRIX_SEED));
  readonly courses = signal<Course[]>(COURSE_SEED.map((c) => ({ ...c })));
  readonly sessions = signal<Session[]>(SESSION_SEED.map((s) => ({ ...s })));
  readonly certs = signal<Cert[]>(CERT_SEED.map((c) => ({ ...c })));
  readonly enrollments = signal<Enrollment[]>(ENROLL_SEED.map((e) => ({ ...e })));
  readonly paths = signal<LPath[]>(clone(PATH_SEED));
  readonly attempts = signal<Attempt[]>(ATTEMPT_SEED.map((a) => ({ ...a })));
  readonly evals = signal<PracticalEval[]>(EVAL_SEED.map((e) => ({ ...e })));
  readonly log = signal<LogEntry[]>([
    { at: iso(-2) + ' 14:20', text: 'Equipment Operation assessed at Level 2 (Basic)', by: 'Maria Santos', empId: 'EMP-001' },
    { at: iso(-9) + ' 09:05', text: 'Auto-enrolled in Fire Safety & Extinguisher Use (renewal due)', by: 'System', empId: 'EMP-001' },
    { at: iso(-31) + ' 11:40', text: 'Emergency Response raised to Level 4 (Proficient)', by: 'David Lee', empId: 'EMP-001' },
    { at: iso(-120) + ' 16:10', text: 'Passed Security Procedures quiz (84%)', by: 'System', empId: 'EMP-001' },
    { at: iso(-230) + ' 12:00', text: 'First Aid Certification issued (valid 24 months)', by: 'Red Crescent Training Institute', empId: 'EMP-001' },
  ]);

  /* compliance / assessments / renewals / reports state */
  readonly quizzes = signal<Quiz[]>(clone(QUIZZES));
  /** quiz assignments awaiting an attempt */
  readonly quizAssigned = signal<{ id: string; quizId: string; empId: string; due: string }[]>([
    { id: 'QA-1', quizId: 'Q-102', empId: 'EMP-001', due: iso(5) },
    { id: 'QA-2', quizId: 'Q-107', empId: 'EMP-007', due: iso(4) },
    { id: 'QA-3', quizId: 'Q-108', empId: 'EMP-027', due: iso(6) },
    { id: 'QA-4', quizId: 'Q-101', empId: 'EMP-016', due: iso(2) },
  ]);
  /** "reqId:empId" gaps closed by recording a completion */
  readonly cleared = signal<string[]>([]);
  /** nudges sent per employee */
  readonly nudges = signal<Record<string, number>>({});
  readonly rules = signal<AlertRule[]>(clone(RULE_SEED));
  readonly alertLog = signal<AlertEvent[]>([
    { at: iso(-1) + ' 06:00', text: 'Daily expiry scan: 5 rules fired · 61 notifications sent', kind: 'rule' },
    { at: iso(-1) + ' 06:00', text: '30-day renewal + auto-enrol: 4 employees auto-enrolled in refreshers', kind: 'renewal' },
    { at: iso(-2) + ' 15:12', text: 'Reminder sent to Ahmed Hassan · Fire Safety Training (12 days)', kind: 'reminder' },
    { at: iso(-2) + ' 06:00', text: 'Licence 14-day escalation: 3 forklift licences escalated to HSE', kind: 'rule' },
    { at: iso(-3) + ' 10:40', text: 'Renewal scheduled · Working at Height for Omar Khalid', kind: 'schedule' },
  ]);
  readonly scheduled = signal<SchedReport[]>(SCHED_SEED.map((s) => ({ ...s })));

  readonly reqById = new Map(REQS.map((r) => [r.id, r]));
  /** Live list of compliance gaps across all regulatory requirements. */
  readonly ncRows = computed<NcRow[]>(() => {
    const cleared = new Set(this.cleared());
    const out: NcRow[] = [];
    const byType = new Map(REQS.filter((r) => r.typeId).map((r) => [r.typeId!, r]));
    for (const c of this.certs()) {
      const r = byType.get(c.typeId);
      if (!r || c.revoked || daysUntil(c.expiry) >= 0) continue;
      out.push({ id: `${r.id}:${c.empId}`, reqId: r.id, empId: c.empId, reason: 'Certificate expired', since: c.expiry, ref: c.id });
    }
    const byCourse = new Map(REQS.map((r) => [r.courseId, r]));
    for (const e of this.enrollments()) {
      const r = byCourse.get(e.courseId);
      if (!r || e.status !== 'Overdue') continue;
      out.push({ id: `${r.id}:${e.empId}:${e.id}`, reqId: r.id, empId: e.empId, reason: 'Training overdue', since: e.due, ref: e.id });
    }
    for (const r of REQS)
      NEVER_TRAINED[r.id].forEach((empId, i) => out.push({ id: `${r.id}:${empId}`, reqId: r.id, empId, reason: 'Never trained', since: iso(-NEVER_SINCE[r.id] - ((i * 7) % 40)) }));
    const seen = new Set<string>();
    return out.filter((x) => !cleared.has(`${x.reqId}:${x.empId}`) && !seen.has(x.id) && (seen.add(x.id), true));
  });
  readonly obligations = REQS.reduce((a, r) => a + r.required, 0);
  readonly compliancePct = computed(() => Math.round((1 - this.ncRows().length / this.obligations) * 1000) / 10);
  /** open (not completed) enrolment for a course, if any */
  openEnroll(empId: string, courseId: string) {
    return this.enrollments().find((e) => e.empId === empId && e.courseId === courseId && e.status !== 'Completed');
  }
  addAlert(text: string, kind: AlertEvent['kind']) {
    const d = new Date();
    this.alertLog.update((l) => [{ at: `${iso(0)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, text, kind }, ...l].slice(0, 60));
  }

  readonly skillById = computed(() => new Map(this.skills().map((s) => [s.id, s])));
  readonly courseById = computed(() => new Map(this.courses().map((c) => [c.id, c])));
  readonly empById = computed(() => new Map(this.emps().map((e) => [e.id, e])));

  /** Change in "below required" cells versus the seed (edits flow into org totals). */
  private readonly gapDelta = computed(() => {
    const seed = new Map(MATRIX_SEED.map((e) => [e.id, e]));
    const d: Record<string, number> = {};
    for (const e of this.emps()) {
      const s0 = seed.get(e.id);
      for (const sk of this.skills()) {
        const now = e.levels[sk.id];
        const was = s0 ? s0.levels[sk.id] : null;
        const a = now !== null && now !== undefined && now < sk.required ? 1 : 0;
        const b = was !== null && was !== undefined && was < sk.required ? 1 : 0;
        d[sk.id] = (d[sk.id] ?? 0) + a - b;
      }
    }
    return d;
  });
  readonly gaps = computed(() =>
    this.skills().map((s) => ({ ...s, gaps: Math.max(0, s.gap + (this.gapDelta()[s.id] ?? 0)) })).sort((a, b) => b.gaps - a.gaps),
  );
  readonly totalGaps = computed(() => this.gaps().reduce((a, s) => a + s.gaps, 0));
  readonly skillsTracked = computed(() => OTHER_TRACKED + this.skills().length);
  /** Bands adjusted by edits to matrix employees (overall band = average of their applicable levels). */
  readonly bands = computed(() => {
    const band = (e: TEmp) => {
      const v = Object.values(e.levels).filter((x): x is number => x !== null && x !== undefined);
      const avg = v.reduce((a, x) => a + x, 0) / (v.length || 1);
      return avg >= 3.5 ? 0 : avg >= 2.75 ? 1 : avg >= 1.5 ? 2 : 3;
    };
    const delta = [0, 0, 0, 0];
    const seed = new Map(MATRIX_SEED.map((e) => [e.id, e]));
    for (const e of this.emps()) {
      const s0 = seed.get(e.id);
      if (!s0) continue;
      delta[band(e)]++;
      delta[band(s0)]--;
    }
    return BANDS.map((b, i) => ({ ...b, value: b.value + delta[i] }));
  });
  readonly proficientPct = computed(() => Math.round((this.bands()[0].value / TOTAL_EMPLOYEES) * 100));

  /** Certificates expiring in the next 30 days (not renewed / revoked). */
  readonly dueSoon = computed(() => this.certs().filter((c) => !c.revoked && daysUntil(c.expiry) >= 0 && daysUntil(c.expiry) <= 30));
  readonly dueGroups = computed(() => {
    const m = new Map<string, { type: CertType; count: number; max: number }>();
    for (const c of this.dueSoon()) {
      const t = CT.get(c.typeId)!;
      const g = m.get(t.id) ?? { type: t, count: 0, max: 0 };
      g.count++;
      g.max = Math.max(g.max, daysUntil(c.expiry));
      m.set(t.id, g);
    }
    return [...m.values()]
      .map((g) => ({ ...g, window: g.max <= 7 ? 7 : g.max <= 14 ? 14 : g.max <= 21 ? 21 : 30 }))
      .sort((a, b) => b.count - a.count || a.window - b.window);
  });

  certsOf(empId: string) {
    return this.certs().filter((c) => c.empId === empId);
  }
  enrollOf(empId: string) {
    return this.enrollments().filter((e) => e.empId === empId);
  }
  status(e: TEmp, skillId: string) {
    const l = e.levels[skillId];
    if (l === null || l === undefined) return 'Not Applicable';
    if (l <= 1) return 'Required';
    if (l === 2) return 'In Progress';
    if (e.due.includes(skillId)) return 'Due for Training';
    return 'Valid';
  }

  addLog(text: string, empId?: string, by = 'Rex Kumar') {
    const d = new Date();
    this.log.update((l) => [{ at: `${iso(0)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, text, by, empId }, ...l]);
  }
  setLevel(empId: string, skillId: string, level: number | null, why = 'updated') {
    const e = this.empById().get(empId);
    if (!e || e.levels[skillId] === level) return;
    this.emps.update((l) => l.map((x) => (x.id === empId ? { ...x, levels: { ...x.levels, [skillId]: level }, due: level !== null && level >= 4 ? x.due.filter((d) => d !== skillId) : x.due } : x)));
    const sk = this.skillById().get(skillId);
    this.addLog(`${sk?.name} ${why} to ${level === null ? 'N/A' : `Level ${level} (${levelName(level)})`}`, empId);
  }
  addSkill(s: Skill) {
    this.skills.update((l) => [...l, s]);
    this.emps.update((l) => l.map((e) => ({ ...e, levels: { ...e.levels, [s.id]: 0 } })));
  }
  enroll(empIds: string[], courseId: string, due: string, source: Enrollment['source'] = 'Manager') {
    const c = this.courseById().get(courseId);
    let n = this.enrollments().length + 5001;
    const existing = new Set(this.enrollments().filter((e) => e.courseId === courseId && e.status !== 'Completed').map((e) => e.empId));
    const add = empIds.filter((id) => !existing.has(id)).map((empId) => ({ id: `ENR-${++n}`, empId, courseId, status: 'Enrolled' as EStatus, progress: 0, enrolled: iso(0), due, source }));
    this.enrollments.update((l) => [...add, ...l]);
    add.forEach((a) => this.empById().has(a.empId) && this.addLog(`Enrolled in ${c?.title}`, a.empId));
    return add.length;
  }
  patchEnroll(id: string, p: Partial<Enrollment>) {
    this.enrollments.update((l) => l.map((e) => (e.id === id ? { ...e, ...p } : e)));
  }
  completeEnroll(id: string, score = 88) {
    const e = this.enrollments().find((x) => x.id === id);
    if (!e) return;
    this.patchEnroll(id, { status: 'Completed', progress: 100, score });
    const c = this.courseById().get(e.courseId);
    // completion renews a matching certificate and raises the skill
    const t = CERT_TYPES.find((x) => x.courseId === e.courseId);
    const cert = t && this.certs().find((x) => x.empId === e.empId && x.typeId === t.id);
    if (cert) this.renew(cert.id, false);
    if (c && this.empById().has(e.empId)) {
      const cur = this.empById().get(e.empId)!.levels[c.skillId] ?? 0;
      if (cur < 3) this.setLevel(e.empId, c.skillId, 3, 'raised after course completion');
    }
  }
  renew(certId: string, log = true) {
    const c = this.certs().find((x) => x.id === certId);
    if (!c) return;
    const t = CT.get(c.typeId)!;
    const from = daysUntil(c.expiry) > 0 ? c.expiry : iso(0);
    this.certs.update((l) => l.map((x) => (x.id === certId ? { ...x, issued: iso(0), expiry: addMonths(from, t.months), revoked: false, snoozed: false } : x)));
    if (log && this.empById().has(c.empId)) this.addLog(`${t.name} renewed`, c.empId);
  }
  patchCert(id: string, p: Partial<Cert>) {
    this.certs.update((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }
  remind(ids: string[]) {
    const set = new Set(ids);
    this.certs.update((l) => l.map((x) => (set.has(x.id) ? { ...x, reminded: (x.reminded ?? 0) + 1 } : x)));
  }
  reset() {
    this.skills.set(SKILL_SEED.map((s) => ({ ...s })));
    this.emps.set(clone(MATRIX_SEED));
    this.courses.set(COURSE_SEED.map((c) => ({ ...c })));
    this.certs.set(CERT_SEED.map((c) => ({ ...c })));
    this.enrollments.set(ENROLL_SEED.map((e) => ({ ...e })));
    this.paths.set(clone(PATH_SEED));
    this.attempts.set(ATTEMPT_SEED.map((a) => ({ ...a })));
    this.evals.set(EVAL_SEED.map((e) => ({ ...e })));
    this.quizzes.set(clone(QUIZZES));
    this.cleared.set([]);
    this.nudges.set({});
    this.rules.set(clone(RULE_SEED));
    this.scheduled.set(SCHED_SEED.map((s) => ({ ...s })));
  }
}
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}
