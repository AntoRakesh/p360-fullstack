// Row-level demo datasets behind the Custom Report Builder and Data Export (deterministic).
import { DATASETS, DEPARTMENTS, rnd, SITES } from './reports.data';

export interface Field {
  key: string;
  label: string;
  type: 'text' | 'num' | 'date';
}
export type Row = Record<string, string | number>;

const FIRST = ['Aisha', 'Omar', 'Priya', 'Daniel', 'Sara', 'Rahul', 'Lina', 'Ken', 'Grace', 'Mohammed', 'Fatima', 'James', 'Mei', 'Arjun', 'Noor', 'Carlos', 'Hana', 'Yusuf', 'Elena', 'Ravi'];
const LAST = ['Rahman', 'Haddad', 'Nair', 'Brooks', 'Khan', 'Mehta', 'Farouk', 'Watanabe', 'Liu', 'Saleh', 'Zahra', 'Wilson', 'Chen', 'Patel', 'Ali', 'Garcia', 'Sato', 'Demir', 'Rossi', 'Iyer'];

export const FIELDS: Record<string, Field[]> = {
  employees: [
    { key: 'id', label: 'Employee ID', type: 'text' }, { key: 'name', label: 'Name', type: 'text' }, { key: 'department', label: 'Department', type: 'text' }, { key: 'site', label: 'Site', type: 'text' },
    { key: 'role', label: 'Role', type: 'text' }, { key: 'type', label: 'Employment Type', type: 'text' }, { key: 'joined', label: 'Join Date', type: 'date' }, { key: 'tenure', label: 'Tenure (yrs)', type: 'num' }, { key: 'status', label: 'Status', type: 'text' },
  ],
  attendance: [
    { key: 'date', label: 'Date', type: 'date' }, { key: 'name', label: 'Employee', type: 'text' }, { key: 'department', label: 'Department', type: 'text' }, { key: 'site', label: 'Site', type: 'text' },
    { key: 'status', label: 'Status', type: 'text' }, { key: 'checkIn', label: 'Check-in', type: 'text' }, { key: 'hours', label: 'Hours Worked', type: 'num' }, { key: 'overtime', label: 'Overtime (h)', type: 'num' },
  ],
  access: [
    { key: 'time', label: 'Timestamp', type: 'date' }, { key: 'name', label: 'Person', type: 'text' }, { key: 'door', label: 'Door', type: 'text' }, { key: 'site', label: 'Site', type: 'text' },
    { key: 'method', label: 'Credential', type: 'text' }, { key: 'result', label: 'Result', type: 'text' }, { key: 'direction', label: 'Direction', type: 'text' },
  ],
  visitors: [
    { key: 'date', label: 'Date', type: 'date' }, { key: 'name', label: 'Visitor', type: 'text' }, { key: 'company', label: 'Company', type: 'text' }, { key: 'host', label: 'Host', type: 'text' },
    { key: 'purpose', label: 'Purpose', type: 'text' }, { key: 'site', label: 'Site', type: 'text' }, { key: 'dwell', label: 'Dwell (min)', type: 'num' }, { key: 'status', label: 'Status', type: 'text' },
  ],
  spaces: [
    { key: 'date', label: 'Date', type: 'date' }, { key: 'space', label: 'Space', type: 'text' }, { key: 'spaceType', label: 'Space Type', type: 'text' }, { key: 'floor', label: 'Floor', type: 'text' },
    { key: 'site', label: 'Site', type: 'text' }, { key: 'department', label: 'Department', type: 'text' }, { key: 'hours', label: 'Booked Hours', type: 'num' }, { key: 'utilization', label: 'Utilization %', type: 'num' },
  ],
  leave: [
    { key: 'applied', label: 'Applied On', type: 'date' }, { key: 'name', label: 'Employee', type: 'text' }, { key: 'department', label: 'Department', type: 'text' }, { key: 'leaveType', label: 'Leave Type', type: 'text' },
    { key: 'days', label: 'Days', type: 'num' }, { key: 'status', label: 'Status', type: 'text' }, { key: 'site', label: 'Site', type: 'text' },
  ],
  training: [
    { key: 'name', label: 'Employee', type: 'text' }, { key: 'course', label: 'Course', type: 'text' }, { key: 'department', label: 'Department', type: 'text' }, { key: 'due', label: 'Due Date', type: 'date' },
    { key: 'status', label: 'Status', type: 'text' }, { key: 'score', label: 'Score', type: 'num' }, { key: 'site', label: 'Site', type: 'text' },
  ],
  incidents: [
    { key: 'date', label: 'Date', type: 'date' }, { key: 'incidentType', label: 'Type', type: 'text' }, { key: 'severity', label: 'Severity', type: 'text' }, { key: 'site', label: 'Site', type: 'text' },
    { key: 'department', label: 'Department', type: 'text' }, { key: 'status', label: 'Status', type: 'text' }, { key: 'lostDays', label: 'Lost Days', type: 'num' },
  ],
  meals: [
    { key: 'date', label: 'Date', type: 'date' }, { key: 'name', label: 'Employee', type: 'text' }, { key: 'meal', label: 'Meal', type: 'text' }, { key: 'site', label: 'Site', type: 'text' },
    { key: 'department', label: 'Department', type: 'text' }, { key: 'cost', label: 'Cost (AED)', type: 'num' }, { key: 'wasted', label: 'Wasted (g)', type: 'num' },
  ],
};

const cache = new Map<string, Row[]>();
/** Up to `n` deterministic sample rows for a dataset (most recent first). */
export function rowsFor(ds: string, n = 400): Row[] {
  const key = `${ds}:${n}`;
  if (cache.has(key)) return cache.get(key)!;
  const R = rnd(ds.length * 977 + n);
  const pick = <T>(a: T[]) => a[Math.floor(R() * a.length)];
  const person = () => `${pick(FIRST)} ${pick(LAST)}`;
  const day = (i: number) => {
    const d = new Date(Date.UTC(2026, 9, 14));
    d.setUTCDate(d.getUTCDate() - Math.floor(i / Math.max(1, n / 45)));
    return d.toISOString().slice(0, 10);
  };
  const site = () => (R() < 0.38 ? SITES[0] : pick(SITES));
  const dept = () => pick(DEPARTMENTS);
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    let r: Row;
    switch (ds) {
      case 'employees':
        r = { id: `EMP-${10234 + i}`, name: person(), department: dept(), site: site(), role: pick(['Analyst', 'Engineer', 'Manager', 'Technician', 'Associate', 'Lead', 'Specialist']), type: pick(['Full-time', 'Full-time', 'Full-time', 'Part-time', 'Contractor', 'Intern']), joined: `20${String(14 + Math.floor(R() * 12)).padStart(2, '0')}-${String(1 + Math.floor(R() * 12)).padStart(2, '0')}-${String(1 + Math.floor(R() * 27)).padStart(2, '0')}`, tenure: 0, status: R() < 0.94 ? 'Active' : 'On Leave' };
        r['tenure'] = 2026 - +String(r['joined']).slice(0, 4);
        break;
      case 'attendance': {
        const st = R() < 0.82 ? 'On Time' : R() < 0.5 ? 'Late' : R() < 0.5 ? 'WFH' : 'Absent';
        const h = st === 'Absent' ? 0 : +(7.5 + R() * 2.4).toFixed(1);
        r = { date: day(i), name: person(), department: dept(), site: site(), status: st, checkIn: st === 'Absent' ? '—' : `0${st === 'Late' ? 9 : 8}:${String(Math.floor(R() * 60)).padStart(2, '0')}`, hours: h, overtime: +Math.max(0, h - 8.5).toFixed(1) };
        break;
      }
      case 'access':
        r = { time: `${day(i)} ${String(6 + Math.floor(R() * 14)).padStart(2, '0')}:${String(Math.floor(R() * 60)).padStart(2, '0')}`, name: person(), door: pick(['Main Lobby Turnstile 1', 'Main Lobby Turnstile 2', 'Server Room', 'Loading Bay', 'Car Park Gate', 'Lab 2 Door', 'Floor 5 East']), site: site(), method: pick(['Card', 'Card', 'Face', 'Mobile', 'PIN']), result: R() < 0.94 ? 'Granted' : 'Denied', direction: R() < 0.55 ? 'In' : 'Out' };
        break;
      case 'visitors':
        r = { date: day(i), name: person(), company: pick(['Acme Corp', 'Globex', 'Initech', 'Umbrella LLC', 'Stark Industries', 'Wayne Enterprises', 'Hooli']), host: person(), purpose: pick(['Meeting', 'Meeting', 'Interview', 'Delivery', 'Maintenance', 'Event']), site: site(), dwell: Math.round(15 + R() * 220), status: pick(['Checked Out', 'Checked Out', 'Checked In', 'No-Show']) };
        break;
      case 'spaces': {
        const t = pick(['Open Desks', 'Meeting Rooms', 'Focus Rooms', 'Collaboration Areas', 'Cafeteria']);
        r = { date: day(i), space: `${t === 'Open Desks' ? 'Desk' : t === 'Meeting Rooms' ? 'Room' : t === 'Focus Rooms' ? 'Pod' : 'Zone'} ${Math.floor(1 + R() * 6)}.${String(Math.floor(1 + R() * 40)).padStart(2, '0')}`, spaceType: t, floor: pick(['Ground', 'Floor 1', 'Floor 2', 'Floor 3', 'Floor 4', 'Floor 5']), site: site(), department: dept(), hours: +(1 + R() * 7).toFixed(1), utilization: Math.round(30 + R() * 68) };
        break;
      }
      case 'leave':
        r = { applied: day(i), name: person(), department: dept(), leaveType: pick(['Annual Leave', 'Annual Leave', 'Sick Leave', 'Casual Leave', 'Comp Off', 'Parental']), days: Math.ceil(R() * 6), status: pick(['Approved', 'Approved', 'Approved', 'Pending', 'Rejected']), site: site() };
        break;
      case 'training':
        r = { name: person(), course: pick(['Fire Safety', 'Code of Conduct', 'Data Privacy', 'First Aid', 'Leadership Essentials', 'Forklift Operation']), department: dept(), due: day(i * 2), status: pick(['Completed', 'Completed', 'Completed', 'In Progress', 'Overdue']), score: Math.round(55 + R() * 45), site: site() };
        break;
      case 'incidents':
        r = { date: day(i * 3), incidentType: pick(['Slip / Trip', 'Manual Handling', 'Equipment', 'Electrical', 'Fire', 'Near Miss']), severity: pick(['Low', 'Low', 'Medium', 'High']), site: site(), department: dept(), status: pick(['Closed', 'Closed', 'Open', 'Under Investigation']), lostDays: R() < 0.8 ? 0 : Math.ceil(R() * 9) };
        break;
      default:
        r = { date: day(i), name: person(), meal: pick(['Lunch', 'Lunch', 'Breakfast', 'Snacks', 'Dinner']), site: site(), department: dept(), cost: +(8 + R() * 22).toFixed(2), wasted: Math.round(R() * 140) };
    }
    rows.push(r);
  }
  cache.set(key, rows);
  return rows;
}
export const datasetOf = (id: string) => DATASETS.find((d) => d.id === id) ?? DATASETS[0];

export interface FilterRule {
  field: string;
  op: 'is' | 'is not' | 'contains' | '>' | '<' | '>=' | '<=';
  value: string;
}
export function applyFilters(rows: Row[], rules: FilterRule[]) {
  return rows.filter((r) =>
    rules.every((f) => {
      if (!f.field || f.value === '') return true;
      const v = r[f.field];
      const s = String(v).toLowerCase();
      const x = f.value.toLowerCase();
      const n = Number(f.value);
      switch (f.op) {
        case 'is': return s === x;
        case 'is not': return s !== x;
        case 'contains': return s.includes(x);
        case '>': return typeof v === 'number' ? v > n : String(v) > f.value;
        case '<': return typeof v === 'number' ? v < n : String(v) < f.value;
        case '>=': return typeof v === 'number' ? v >= n : String(v) >= f.value;
        case '<=': return typeof v === 'number' ? v <= n : String(v) <= f.value;
      }
    }),
  );
}
export function groupRows(rows: Row[], by: string, agg: 'count' | 'sum' | 'avg', measure: string) {
  const m = new Map<string, number[]>();
  rows.forEach((r) => {
    const k = String(r[by]);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(Number(r[measure]) || 0);
  });
  return [...m.entries()]
    .map(([key, v]) => ({ key, value: agg === 'count' ? v.length : agg === 'sum' ? +v.reduce((a, b) => a + b, 0).toFixed(1) : +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) }))
    .sort((a, b) => (by.match(/date|time|applied|due/) ? (a.key < b.key ? -1 : 1) : b.value - a.value));
}
