// Hard-coded dataset for Visitor Analytics & Reports (reference image: 01–15 Oct 2026).
export interface Seg { label: string; n: number; color: string }
export interface RangeDef { key: string; label: string; f: number; labels: string[]; total: number[]; inn: number[]; out: number[]; deltas: [string, string, string]; prev: string }

const T = [62, 88, 92, 79, 91, 99, 110, 102, 117, 129, 150, 198, 168, 147, 126];
const I = [48, 61, 66, 58, 63, 72, 84, 77, 92, 101, 118, 140, 122, 108, 95];
const O = [31, 40, 43, 38, 45, 47, 52, 50, 55, 61, 72, 88, 72, 64, 56];
const d2 = (n: number) => String(n).padStart(2, '0');

export const RANGES: RangeDef[] = [
  { key: 'oct', label: '01–15 Oct 2026', f: 1, labels: T.map((_, i) => `${d2(i + 1)}|Oct`), total: T, inn: I, out: O, deltas: ['+12.8%', '-4.2%', '+2.1%'], prev: '16–30 Sep 2026' },
  { key: '7d', label: 'Last 7 Days', f: 0.73, labels: T.slice(8).map((_, i) => `${d2(i + 9)}|Oct`), total: T.slice(8), inn: I.slice(8), out: O.slice(8), deltas: ['+18.4%', '-2.9%', '+1.4%'], prev: '02–08 Oct 2026' },
  { key: 'sep', label: 'Sep 2026', f: 2.18, labels: T.map((_, i) => `${d2(i * 2 + 1)}|Sep`), total: T.map((v, i) => Math.round(v * 0.86 + (i % 3) * 9)), inn: I.map((v, i) => Math.round(v * 0.86 + (i % 3) * 7)), out: O.map((v, i) => Math.round(v * 0.86 + (i % 3) * 5)), deltas: ['+6.1%', '+1.8%', '-0.6%'], prev: 'Aug 2026' },
  { key: 'q3', label: 'Q3 2026', f: 6.42, labels: T.slice(0, 13).map((_, i) => `W${27 + i}|wk`), total: T.slice(0, 13).map((v, i) => Math.round(v * 4.4 + (i % 4) * 18)), inn: I.slice(0, 13).map((v, i) => Math.round(v * 4.4 + (i % 4) * 14)), out: O.slice(0, 13).map((v, i) => Math.round(v * 4.4 + (i % 4) * 9)), deltas: ['+9.7%', '-1.1%', '+0.8%'], prev: 'Q2 2026' },
];

export const TYPES: Seg[] = [
  { label: 'Pre-Registered', n: 674, color: '#8b3dff' },
  { label: 'Walk-in', n: 300, color: '#22a447' },
  { label: 'Invited by Employee', n: 187, color: '#f97316' },
  { label: 'Contractor Portal', n: 87, color: '#3b82f6' },
];
export const PURPOSES: Seg[] = [
  { label: 'Business Meeting', n: 38, color: '#7c3aed' },
  { label: 'Delivery', n: 18, color: '#22a447' },
  { label: 'Interview', n: 15, color: '#f97316' },
  { label: 'Site Visit', n: 12, color: '#3b82f6' },
  { label: 'Maintenance', n: 9, color: '#b67cf5' },
  { label: 'Other', n: 8, color: '#c4c4cc' },
];
export const PURPOSE_DUR: Record<string, [number, string]> = {
  'Business Meeting': [118, 'Main Campus – Tower A'], Delivery: [22, 'Main Campus – Tower B'], Interview: [96, 'Main Campus – Tower A'],
  'Site Visit': [164, 'Plant Site – North Block'], Maintenance: [187, 'Plant Site – North Block'], Other: [74, 'Main Campus – Tower C'],
};

export const HOURS = ['8|AM', '9|AM', '10|AM', '11|AM', '12|PM', '1|PM', '2|PM', '3|PM', '4|PM', '5|PM', '6|PM'];
export const ARRIVALS = [28, 46, 100, 98, 92, 62, 50, 40, 36, 30, 22];
export const OCCUPANCY = [52, 96, 148, 186, 172, 150, 128, 112, 96, 74, 52];

export interface SiteRow { site: string; n: number; rate: number; dur: number; peak: number }
export const SITE_ROWS: SiteRow[] = [
  { site: 'Main Campus – Tower A', n: 642, rate: 97.2, dur: 106, peak: 96 },
  { site: 'Main Campus – Tower B', n: 318, rate: 95.8, dur: 99, peak: 48 },
  { site: 'Plant Site – North Block', n: 188, rate: 96.3, dur: 101, peak: 27 },
  { site: 'Main Campus – Tower C', n: 100, rate: 94.0, dur: 97, peak: 15 },
];

export interface HostRow { name: string; dept: string; n: number; dur: number; noShow: number }
export const HOST_ROWS: HostRow[] = [
  { name: 'Priya Sharma', dept: 'Business Development', n: 86, dur: 104, noShow: 2.3 },
  { name: 'Li Wei', dept: 'Human Resources', n: 72, dur: 88, noShow: 4.1 },
  { name: 'Ahmed Hassan', dept: 'Logistics', n: 61, dur: 31, noShow: 1.6 },
  { name: 'Ramesh Kumar', dept: 'Plant Operations', n: 54, dur: 152, noShow: 3.7 },
  { name: 'Fatima Ali', dept: 'Facilities', n: 48, dur: 121, noShow: 2.1 },
  { name: 'Michael Chen', dept: 'IT', n: 41, dur: 77, noShow: 4.9 },
  { name: 'Rex Kumar', dept: 'Executive Office', n: 36, dur: 64, noShow: 0 },
  { name: 'Maria Santos', dept: 'Compliance', n: 29, dur: 95, noShow: 3.4 },
];

export type RepStatus = 'Ready' | 'Scheduled' | 'Generating';
export interface AnReport { id: number; name: string; kind: string; scope: string; period: string; by: string; lastRun: string; status: RepStatus; schedule?: string; format: string }
export const REPORT_KINDS = ['Visitor Volume Summary', 'Visitor Purpose Analysis', 'Security & Compliance Report', 'Host Performance Report', 'Site Comparison Report', 'Peak Hours & Occupancy'];
export const REPORTS: AnReport[] = [
  { id: 1, name: 'Visitor Volume Summary', kind: 'Visitor Volume Summary', scope: 'All Sites', period: '01–15 Oct 2026', by: 'Priya Sharma', lastRun: 'Today 10:12 AM', status: 'Ready', format: 'CSV' },
  { id: 2, name: 'Visitor Purpose Analysis', kind: 'Visitor Purpose Analysis', scope: 'Main Campus', period: 'Sep 2026', by: 'Rex Kumar', lastRun: 'Yesterday', status: 'Ready', format: 'PDF' },
  { id: 3, name: 'Security & Compliance Report', kind: 'Security & Compliance Report', scope: 'All Sites', period: 'Q3 2026', by: 'Security Admin', lastRun: '14 Oct 2026', status: 'Scheduled', schedule: 'Weekly · Mon 08:00 AM', format: 'PDF' },
];

export const fmtDur = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;
