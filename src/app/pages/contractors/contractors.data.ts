// Shared hard-coded data for Contractor & Vendor Workforce.
import { rng } from '../dashboards/demo-data';

export interface Company {
  id: string;
  code: string;
  name: string;
  initials: string;
  color: string;
  icon: string;
  trade: string;
  contractType: string;
  start: string;
  end: string;
  workers: number;
  active: number;
  status: 'Active' | 'Under Review' | 'Inactive' | 'Suspended';
  compliance: number;
  contact: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  sites: string[];
  issues: number;
  value: number;
}

type Seed = [string, string, string, string, string, number, Company['status'], number, string, string];
const SEED: Seed[] = [
  ['Al Maha Facilities LLC', 'Facilities Management', 'Annual', '2025-01-01', '2026-12-31', 450, 'Active', 92, 'Ahmed Al Falasi', 'almaha.ae'],
  ['Gulf Tech Solutions', 'IT Support', 'Multi-Year', '2024-03-01', '2027-02-28', 120, 'Active', 88, 'Rahul Menon', 'gulftech.ae'],
  ['SecureGuard Services', 'Security', 'Annual', '2025-06-01', '2026-05-31', 320, 'Active', 95, 'Khalid Saeed', 'secureguard.ae'],
  ['CleanWay Cleaning Co.', 'Cleaning Services', 'Annual', '2025-01-01', '2026-12-31', 280, 'Active', 90, 'Maria Gomez', 'cleanway.ae'],
  ['BuildRight Contracting', 'Civil Works', 'Project Based', '2025-02-15', '2027-02-14', 650, 'Active', 85, 'Tom Baker', 'buildright.ae'],
  ['PowerGrid Electromech', 'MEP Services', 'Multi-Year', '2024-04-01', '2027-03-31', 310, 'Active', 91, 'Vikram Rao', 'powergrid.ae'],
  ['GreenScape Landscaping', 'Landscaping', 'Annual', '2025-05-01', '2026-04-30', 95, 'Active', 87, 'Lina Haddad', 'greenscape.ae'],
  ['TransLog Logistics', 'Transportation', 'Annual', '2025-01-01', '2026-12-31', 210, 'Active', 89, 'Omar Siddiqui', 'translog.ae'],
  ['MedCare Manpower', 'Healthcare Support', 'Annual', '2025-03-01', '2026-02-28', 160, 'Under Review', 76, 'Dr. Sana Iqbal', 'medcare.ae'],
  ['QuickFix Maintenance', 'Equipment Maintenance', 'Annual', '2025-01-01', '2026-12-31', 140, 'Inactive', 0, 'Jason Lee', 'quickfix.ae'],
];
const TRADES = ['Catering', 'Pest Control', 'Elevator Maintenance', 'Fire Safety', 'Glass & Facade', 'HVAC', 'Painting', 'Plumbing', 'Waste Management', 'IT Cabling', 'Printing Services', 'Courier', 'Interior Fit-out', 'Water Treatment', 'Scaffolding'];
const NAMES = ['Desert Rose', 'Falcon', 'Emirates', 'Oasis', 'Pearl', 'Horizon', 'Crescent', 'Dune', 'Skyline', 'Marina', 'Atlas', 'Summit', 'Gulfstar', 'Nakheel', 'Zayed', 'Harbor', 'Sandstone', 'Coral', 'Palm', 'Jumeirah'];
const SUFFIX = ['Services LLC', 'Technical Co.', 'Contracting', 'Solutions', 'General Trading', 'Facilities'];
const COLORS = ['#7c3aed', '#2563eb', '#0d9488', '#ca8a04', '#db2777', '#dc2626', '#16a34a', '#0891b2', '#ea580c', '#475569'];
const ICONS = ['building', 'cpu', 'shield', 'sparkles', 'hard-hat', 'plug', 'tree', 'truck', 'shield-plus', 'settings'];
export const ALL_SITES = ['Head Office', 'Manufacturing', 'Warehouse', 'Regional Office', 'Tech Center', 'Data Center', 'Logistics Hub', 'Retail Stores'];
export const COUNTRIES = ['UAE', 'KSA', 'India', 'Oman', 'Qatar'];
const ini = (n: string) => n.split(' ').filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join('').slice(0, 2);

export const COMPANIES: Company[] = (() => {
  const r = rng(4848);
  const out: Company[] = SEED.map(([name, trade, contractType, start, end, workers, status, compliance, contact, domain], i) => {
    const inactive = status === 'Inactive' ? workers : Math.round(workers * (0.02 + r() * 0.04));
    return {
      id: `C${i}`, code: `CMP-${String(i + 1).padStart(3, '0')}`, name, initials: ini(name), color: COLORS[i], icon: ICONS[i], trade, contractType, start, end, workers, active: workers - inactive, status, compliance,
      contact, email: `${contact.split(' ').slice(-2).join('').toLowerCase().replace(/[^a-z]/g, '')}@${domain}`, phone: `+971 50 ${100 + i * 11} ${4567 + i}`,
      address: 'Dubai, UAE', country: 'UAE', sites: ALL_SITES.slice(0, 2 + (i % 4)).concat(i === 0 ? ['Data Center'] : []), issues: status === 'Inactive' ? 4 : Math.floor(r() * 14), value: workers * (9000 + Math.round(r() * 6000)),
    };
  });
  out[0].active = 428;
  out[0].issues = 12;
  // 38 smaller companies → 48 total, ~3,245 workers
  let remaining = 3245 - out.reduce((a, c) => a + c.workers, 0);
  for (let i = 10; i < 48; i++) {
    const name = `${NAMES[i % NAMES.length]} ${SUFFIX[(i * 7) % SUFFIX.length]}`;
    const left = 48 - i;
    const workers = i === 47 ? remaining : Math.max(3, Math.round((remaining / left) * (0.4 + r() * 1.2)));
    remaining -= workers;
    const st: Company['status'] = i % 13 === 0 ? 'Under Review' : i % 17 === 0 ? 'Inactive' : 'Active';
    const y = 2024 + (i % 2);
    const m = 1 + (i % 12);
    out.push({
      id: `C${i}`, code: `CMP-${String(i + 1).padStart(3, '0')}`, name, initials: ini(name), color: COLORS[i % COLORS.length], icon: ICONS[i % ICONS.length], trade: TRADES[i % TRADES.length],
      contractType: ['Annual', 'Multi-Year', 'Project Based', 'Call-off'][i % 4], start: `${y}-${String(m).padStart(2, '0')}-01`, end: `${y + 2}-${String(m).padStart(2, '0')}-01`,
      workers, active: st === 'Inactive' ? 0 : Math.round(workers * 0.95), status: st, compliance: st === 'Inactive' ? 0 : i % 3 === 0 && i < 44 ? Math.round(70 + r() * 9) : Math.round(80 + r() * 19),
      contact: `${['Ali', 'Sara', 'John', 'Priya', 'Hassan', 'Mei'][i % 6]} ${['Khan', 'Thomas', 'Nair', 'Saleh', 'Wong', 'Rossi'][(i * 5) % 6]}`, email: `contact@${name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}.com`,
      phone: `+971 5${i % 9} ${200 + i} ${1000 + i * 37}`, address: ['Dubai, UAE', 'Abu Dhabi, UAE', 'Sharjah, UAE', 'Riyadh, KSA', 'Mumbai, India', 'Muscat, Oman'][i % 6],
      country: COUNTRIES[[0, 0, 0, 1, 2, 3][i % 6]], sites: ALL_SITES.slice(i % 5, (i % 5) + 1 + (i % 3)), issues: Math.floor(r() * 6), value: workers * (8000 + Math.round(r() * 7000)),
    });
  }
  return out;
})();
export const companyByName = (n: string) => COMPANIES.find((c) => c.name === n);

/* ---------- Contractor workers (3,245) ---------- */
export interface Worker {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  company: string;
  companyId: string;
  trade: string;
  site: string;
  induction: 'Completed' | 'Pending' | 'Expired';
  permitExpiry: string;
  compliance: 'Compliant' | 'Expiring' | 'Non-compliant';
  status: 'Active' | 'Suspended' | 'Inactive';
  onSite: boolean;
  checkIn: string;
}
const FIRST = ['Ramesh', 'Ahmed', 'Suresh', 'Imran', 'Joseph', 'Bilal', 'Anil', 'Faisal', 'Ravi', 'Tariq', 'Manoj', 'Nasser', 'Kiran', 'Yasir', 'Deepak', 'Hamza', 'Arun', 'Salim', 'George', 'Rizwan'];
const LAST = ['Kumar', 'Hassan', 'Pillai', 'Khan', 'Thomas', 'Ahmed', 'Nair', 'Rehman', 'Das', 'Mirza', 'Singh', 'Qureshi', 'Menon', 'Iqbal', 'Varghese', 'Shah'];
const ROLES: Record<string, string[]> = { default: ['Technician', 'Supervisor', 'Helper', 'Operator', 'Foreman'] };

export const WORKERS: Worker[] = (() => {
  const r = rng(3245);
  const out: Worker[] = [];
  let n = 456;
  for (const c of COMPANIES) {
    for (let k = 0; k < c.workers; k++) {
      const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
      const days = Math.round(-20 + r() * 400);
      const ind = r();
      const inactive = k >= c.active;
      const induction: Worker['induction'] = ind < 0.85 ? 'Completed' : ind < 0.95 ? 'Pending' : 'Expired';
      const onSite = !inactive && r() < 0.708;
      out.push({
        id: `CON-${String(n++).padStart(5, '0')}`, name, initials: name.split(' ').map((x) => x[0]).join(''), avatar: COLORS[(n * 7) % COLORS.length],
        company: c.name, companyId: c.id, trade: `${c.trade.split(' ')[0]} ${ROLES['default'][Math.floor(r() * 5)]}`, site: c.sites[Math.floor(r() * c.sites.length)],
        induction, permitExpiry: new Date(Date.now() + days * 86400000).toISOString().slice(0, 10),
        compliance: c.status === 'Inactive' ? 'Non-compliant' : days < 0 || induction === 'Expired' ? 'Non-compliant' : days < 30 ? 'Expiring' : 'Compliant',
        status: inactive ? 'Inactive' : 'Active', onSite, checkIn: onSite ? `0${6 + Math.floor(r() * 3)}:${String(Math.floor(r() * 60)).padStart(2, '0')}` : '',
      });
    }
  }
  out[0] = { ...out[0], name: 'Ramesh Kumar', initials: 'RK', id: 'CON-00456' };
  // Exactly 2,186 on site today (67.4% of 3,245), spread across active workers.
  const active = out.filter((w) => w.status === 'Active');
  active.forEach((w, i) => {
    w.onSite = i % active.length < 2186 && (i * 2186) % active.length < 2186 ? true : false;
  });
  let n2 = active.filter((w) => w.onSite).length;
  for (const w of active) {
    if (n2 >= 2186) break;
    if (!w.onSite) {
      w.onSite = true;
      n2++;
    }
  }
  for (const w of active) {
    if (n2 <= 2186) break;
    if (w.onSite) {
      w.onSite = false;
      n2--;
    }
  }
  active.forEach((w, i) => (w.checkIn = w.onSite ? `0${6 + (i % 3)}:${String((i * 7) % 60).padStart(2, '0')}` : ''));
  return out;
})();

export const fmtDate = (v: string) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const DOC_TYPES = ['Trade Licence', 'Insurance (PL)', 'Workmen Comp.', 'HSE Certificate', 'VAT Certificate', 'ISO 45001'];
