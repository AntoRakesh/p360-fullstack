// Shared hard-coded demo data used by the Command Center & Dashboards pages.

export function rng(seed: number) {
  let s = Math.abs(Math.round(seed)) % 233280 || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export const NAMES = [
  'John Mathew', 'Priya Nair', 'David Chen', 'Sarah Johnson', 'Omar Khalid', 'Li Wei', 'Maria Garcia', 'Arjun Mehta',
  'Emma Wilson', 'Yusuf Rahman', 'Chloe Martin', 'Ravi Shankar', 'Nadia Hussein', 'Tom Baker', 'Aisha Bello', 'Kenji Sato',
  'Lucas Silva', 'Fatima Ali', 'Daniel Kim', 'Hannah Lee', 'Vikram Rao', 'Sofia Rossi', 'Ahmed Saleh', 'Grace Park',
  'Ibrahim Musa', 'Ramesh Kumar', 'Ali Hassan', 'Meera Iyer', 'James Carter', 'Layla Haddad', 'Noah Brown', 'Zara Khan',
];

export const DEPARTMENTS = ['Operations', 'Engineering', 'Sales', 'Finance', 'HR', 'IT', 'Logistics', 'Security'];
export const SITE_NAMES = ['Head Office', 'Manufacturing', 'Warehouse', 'Logistics Hub', 'Retail Stores', 'Data Center'];
export const COMPANIES = ['BuildRight LLC', 'SafeGuard Security', 'CleanPro Services', 'TechServe FM', 'Rapid Logistics', 'Spark Electricals'];

const AVATAR_COLORS = ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0d9488)', 'var(--ka-ca8a04)', 'var(--ka-db2777)', 'var(--ka-475569)', 'var(--ka-16a34a)', 'var(--ka-ea580c)'];

export const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
export const avatarColor = (name: string) => AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

/** "8 Oct" style labels for the last `n` days ending at `end`. */
export function dayLabels(n: number, end: Date) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setDate(end.getDate() - (n - 1 - i));
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  });
}

export const HOURS = ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
export const MONTHS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

/** Series of `n` values around `base` with deterministic noise. */
export function series(n: number, base: number, spread: number, seed: number) {
  const r = rng(seed);
  return Array.from({ length: n }, () => Math.round((base + (r() - 0.5) * 2 * spread) * 10) / 10);
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
