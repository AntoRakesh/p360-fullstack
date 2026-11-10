// Customer & Visitor Analytics: one shared demo dataset + root store (signals).
import { computed, inject, Injectable, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';

export interface ASite { name: string; factor: number; capacity: number; }
export const A_SITES: ASite[] = [
  { name: 'Mall - Main Branch', factor: 1, capacity: 600 },
  { name: 'Mall - City Centre', factor: 0.78, capacity: 480 },
  { name: 'Mall - Marina Walk', factor: 0.64, capacity: 420 },
  { name: 'Outlet - Airport T2', factor: 0.41, capacity: 260 },
];
export const A_RANGES = ['Today', 'Last 7 Days', 'Last 30 Days'] as const;
export type ARange = (typeof A_RANGES)[number];
const RANGE_MUL: Record<ARange, number> = { Today: 0.16, 'Last 7 Days': 1, 'Last 30 Days': 4.24 };

/** Dates offered in the date picker (the dataset's "today" is 14 Oct 2026). */
export const A_DATES = ['2026-10-14', '2026-10-13', '2026-10-12', '2026-10-11', '2026-10-10', '2026-10-09', '2026-10-08'];
export const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export type ZoneType = 'Entrance' | 'Retail' | 'Dining' | 'Parking' | 'Leisure' | 'Event';
export interface AZone {
  id: string;
  name: string;
  type: ZoneType;
  floor: string;
  entries: number;
  exits: number;
  occ: number;
  capacity: number;
  /** Alert when occupancy % goes over this. */
  threshold: number;
  dwell: number; // minutes
  conv: number; // conversion %
  color: string;
  /** Position on the mall map (viewBox 1000 × 330). */
  x: number; y: number; w: number; h: number;
  trend: number[];
  camera: string;
}
export const ZONE_SEED: AZone[] = [
  { id: 'Z1', name: 'Main Entrance', type: 'Entrance', floor: 'Ground', entries: 1824, exits: 1740, occ: 46, capacity: 80, threshold: 85, dwell: 72, conv: 0, color: 'var(--ka-7c3aed)', x: 30, y: 196, w: 220, h: 116, trend: [12, 14, 13, 16, 15, 18, 17, 21, 19, 22], camera: 'CAM-01' },
  { id: 'Z2', name: 'Food Court', type: 'Dining', floor: 'Level 1', entries: 1256, exits: 1190, occ: 112, capacity: 140, threshold: 85, dwell: 108, conv: 46.2, color: 'var(--ka-f97316)', x: 700, y: 20, w: 270, h: 150, trend: [10, 12, 11, 14, 13, 12, 16, 15, 18, 17], camera: 'CAM-04' },
  { id: 'Z3', name: 'Retail Zone', type: 'Retail', floor: 'Ground', entries: 1018, exits: 980, occ: 98, capacity: 130, threshold: 85, dwell: 86, conv: 22.4, color: 'var(--ka-3b82f6)', x: 30, y: 20, w: 300, h: 150, trend: [9, 11, 10, 12, 14, 12, 15, 14, 13, 16], camera: 'CAM-02' },
  { id: 'Z4', name: 'Parking Entry', type: 'Parking', floor: 'Basement', entries: 680, exits: 640, occ: 18, capacity: 40, threshold: 90, dwell: 42, conv: 0, color: 'var(--ka-22c55e)', x: 820, y: 196, w: 72, h: 116, trend: [8, 10, 9, 11, 10, 13, 11, 12, 14, 13], camera: 'CAM-06' },
  { id: 'Z5', name: 'Parking Exit', type: 'Parking', floor: 'Basement', entries: 602, exits: 580, occ: 12, capacity: 30, threshold: 90, dwell: 38, conv: 0, color: 'var(--ka-14b8a6)', x: 898, y: 196, w: 72, h: 116, trend: [11, 9, 12, 10, 13, 11, 10, 12, 11, 14], camera: 'CAM-07' },
  { id: 'Z6', name: 'Event Area', type: 'Event', floor: 'Ground', entries: 420, exits: 392, occ: 54, capacity: 70, threshold: 80, dwell: 55, conv: 12.8, color: 'var(--ka-ec4899)', x: 400, y: 196, w: 250, h: 116, trend: [6, 8, 7, 9, 12, 10, 9, 13, 12, 15], camera: 'CAM-05' },
  { id: 'Z7', name: 'Cinema', type: 'Leisure', floor: 'Level 2', entries: 348, exits: 310, occ: 56, capacity: 70, threshold: 90, dwell: 130, conv: 61.5, color: 'var(--ka-8b5cf6)', x: 360, y: 20, w: 310, h: 150, trend: [5, 6, 8, 7, 9, 8, 10, 12, 11, 13], camera: 'CAM-03' },
  { id: 'Z8', name: 'Kids Zone', type: 'Leisure', floor: 'Level 1', entries: 272, exits: 230, occ: 32, capacity: 40, threshold: 85, dwell: 64, conv: 18.9, color: 'var(--ka-eab308)', x: 680, y: 196, w: 120, h: 116, trend: [4, 6, 5, 7, 6, 8, 7, 9, 8, 10], camera: 'CAM-08' },
];

export const TREND_DAYS = ['8 Oct', '9 Oct', '10 Oct', '11 Oct', '12 Oct', '13 Oct', '14 Oct'];
export const TREND_IN = [575, 905, 930, 900, 1724, 1270, 890];
export const TREND_OUT = [505, 785, 845, 800, 1612, 1030, 720];
export const HOURS = ['6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM', '8 PM', '9 PM'];
export const HOURS_FULL = HOURS.map((h) => h.replace(' ', ':00 '));
export const PEAK_TODAY = [120, 210, 320, 430, 560, 700, 880, 1120, 1460, 1842, 1620, 1380, 1180, 940, 760, 620];
export const PEAK_LAST = [90, 160, 260, 360, 470, 600, 760, 960, 1240, 1560, 1420, 1210, 1020, 820, 660, 540];

export const VISITOR_TYPES = [
  { label: 'Customers', value: 8488, color: 'var(--ka-7c3aed)' },
  { label: 'Staff', value: 1747, color: 'var(--ka-3b82f6)' },
  { label: 'Contractors', value: 999, color: 'var(--ka-22c55e)' },
  { label: 'Visitors', value: 749, color: 'var(--ka-f59e0b)' },
  { label: 'Others', value: 499, color: 'var(--ka-ef4444)' },
];

export type DevType = '3D People Counter' | 'AI Camera' | 'Thermal Sensor' | 'Wi-Fi Probe' | 'Queue Sensor';
export type DevStatus = 'Online' | 'Offline' | 'Warning' | 'Disabled';
export interface ADevice {
  id: string; name: string; type: DevType; zone: string; status: DevStatus; accuracy: number;
  firmware: string; ip: string; uptime: number; lastSeen: string; counted: number;
}
const DEV_ROWS: [string, string, DevType, string, DevStatus, number, string][] = [
  ['CAM-01', 'Main Atrium Cam', 'AI Camera', 'Main Entrance', 'Online', 98.9, '4.2.1'],
  ['CAM-02', 'Retail Concourse Cam', 'AI Camera', 'Retail Zone', 'Online', 98.1, '4.2.1'],
  ['CAM-03', 'Cinema Lobby Cam', 'AI Camera', 'Cinema', 'Online', 97.6, '4.2.0'],
  ['CAM-04', 'Food Court Cam', 'AI Camera', 'Food Court', 'Online', 98.4, '4.2.1'],
  ['CAM-05', 'Event Stage Cam', 'AI Camera', 'Event Area', 'Warning', 91.2, '4.1.8'],
  ['CAM-06', 'Parking Ramp In', 'AI Camera', 'Parking Entry', 'Online', 99.1, '4.2.1'],
  ['CAM-07', 'Parking Ramp Out', 'AI Camera', 'Parking Exit', 'Online', 98.7, '4.2.1'],
  ['CAM-08', 'Kids Zone Cam', 'AI Camera', 'Kids Zone', 'Offline', 0, '4.1.8'],
  ['PC-101', 'Entrance Gate A Counter', '3D People Counter', 'Main Entrance', 'Online', 99.4, '2.8.3'],
  ['PC-102', 'Entrance Gate B Counter', '3D People Counter', 'Main Entrance', 'Online', 99.2, '2.8.3'],
  ['PC-103', 'Food Court North Counter', '3D People Counter', 'Food Court', 'Online', 98.8, '2.8.3'],
  ['PC-104', 'Retail Arcade Counter', '3D People Counter', 'Retail Zone', 'Online', 99.0, '2.8.2'],
  ['PC-105', 'Cinema Entry Counter', '3D People Counter', 'Cinema', 'Online', 98.6, '2.8.3'],
  ['PC-106', 'Event Hall Counter', '3D People Counter', 'Event Area', 'Online', 97.9, '2.8.1'],
  ['TS-201', 'Kids Zone Thermal', 'Thermal Sensor', 'Kids Zone', 'Online', 96.4, '1.5.0'],
  ['TS-202', 'Mezzanine Thermal', 'Thermal Sensor', 'Retail Zone', 'Warning', 93.8, '1.4.7'],
  ['WF-301', 'Wi-Fi Probe L0', 'Wi-Fi Probe', 'Main Entrance', 'Online', 92.5, '3.0.4'],
  ['WF-302', 'Wi-Fi Probe L1', 'Wi-Fi Probe', 'Food Court', 'Online', 91.8, '3.0.4'],
  ['QS-401', 'Checkout Queue Sensor 1', 'Queue Sensor', 'Retail Zone', 'Online', 97.2, '1.9.2'],
  ['QS-402', 'Food Court Queue Sensor', 'Queue Sensor', 'Food Court', 'Online', 96.9, '1.9.2'],
  ['QS-403', 'Cinema Box Office Sensor', 'Queue Sensor', 'Cinema', 'Online', 97.5, '1.9.2'],
  ['QS-404', 'Customer Service Sensor', 'Queue Sensor', 'Main Entrance', 'Online', 98.0, '1.9.2'],
];
export const DEVICE_SEED: ADevice[] = DEV_ROWS.map(([id, name, type, zone, status, accuracy, firmware], i) => ({
  id, name, type, zone, status, accuracy, firmware,
  ip: `10.20.${4 + (i % 3)}.${21 + i * 3}`,
  uptime: status === 'Offline' ? 0 : 99.9 - ((i * 7) % 12) / 10,
  lastSeen: status === 'Offline' ? '09:12 AM' : status === 'Warning' ? '10:21 AM' : '10:24 AM',
  counted: status === 'Offline' ? 0 : 320 + ((i * 137) % 1400),
}));

export interface ACounter { id: string; name: string; zone: string; open: boolean; waiting: number; wait: number; served: number; staff: string; }
export const COUNTER_SEED: ACounter[] = [
  { id: 'Q1', name: 'Checkout 1', zone: 'Retail Zone', open: true, waiting: 6, wait: 3.4, served: 42, staff: 'Aisha Khan' },
  { id: 'Q2', name: 'Checkout 2', zone: 'Retail Zone', open: true, waiting: 9, wait: 5.1, served: 38, staff: 'Omar Farooq' },
  { id: 'Q3', name: 'Checkout 3', zone: 'Retail Zone', open: false, waiting: 0, wait: 0, served: 0, staff: '' },
  { id: 'Q4', name: 'Food Court Orders A', zone: 'Food Court', open: true, waiting: 14, wait: 7.8, served: 61, staff: 'Priya Nair' },
  { id: 'Q5', name: 'Food Court Orders B', zone: 'Food Court', open: true, waiting: 11, wait: 6.2, served: 57, staff: 'Daniel Costa' },
  { id: 'Q6', name: 'Cinema Box Office', zone: 'Cinema', open: true, waiting: 8, wait: 4.6, served: 35, staff: 'Lina Haddad' },
  { id: 'Q7', name: 'Customer Service Desk', zone: 'Main Entrance', open: true, waiting: 3, wait: 2.1, served: 22, staff: 'Rahul Mehta' },
  { id: 'Q8', name: 'Parking Pay Station', zone: 'Parking Exit', open: true, waiting: 5, wait: 2.8, served: 48, staff: 'Kiosk' },
  { id: 'Q9', name: 'Kids Zone Tickets', zone: 'Kids Zone', open: false, waiting: 0, wait: 0, served: 0, staff: '' },
  { id: 'Q10', name: 'Event Registration', zone: 'Event Area', open: true, waiting: 7, wait: 4.0, served: 29, staff: 'Sara Ali' },
];
export const STAFF_POOL = ['Fatima Noor', 'Hassan Javed', 'Maria Lopez', 'Yusuf Rahman', 'Chen Wei', 'Nadia Saeed'];

export interface AReport { id: string; name: string; type: string; schedule: string; format: 'PDF' | 'CSV' | 'XLSX'; recipients: string; lastRun: string; active: boolean; }
export const REPORT_SEED: AReport[] = [
  { id: 'R1', name: 'Daily Footfall Summary', type: 'Footfall', schedule: 'Daily · 07:00', format: 'PDF', recipients: 'mall-ops@purpleiq.ai', lastRun: '14 Oct 2026, 07:00', active: true },
  { id: 'R2', name: 'Weekly Zone Performance', type: 'Zones', schedule: 'Weekly · Mon 08:00', format: 'XLSX', recipients: 'leasing@purpleiq.ai', lastRun: '12 Oct 2026, 08:00', active: true },
  { id: 'R3', name: 'Queue SLA Report', type: 'Queues', schedule: 'Daily · 22:00', format: 'PDF', recipients: 'service@purpleiq.ai', lastRun: '13 Oct 2026, 22:00', active: true },
  { id: 'R4', name: 'Monthly Demographics', type: 'Demographics', schedule: 'Monthly · 1st 09:00', format: 'PDF', recipients: 'marketing@purpleiq.ai', lastRun: '01 Oct 2026, 09:00', active: true },
  { id: 'R5', name: 'Campaign Conversion', type: 'Conversion', schedule: 'Weekly · Fri 17:00', format: 'CSV', recipients: 'marketing@purpleiq.ai', lastRun: '09 Oct 2026, 17:00', active: false },
  { id: 'R6', name: 'Device Health Digest', type: 'Devices', schedule: 'Daily · 06:00', format: 'CSV', recipients: 'it-support@purpleiq.ai', lastRun: '14 Oct 2026, 06:00', active: true },
];
export interface ARun { id: string; name: string; at: string; by: string; size: string; format: string; }
export const RUN_SEED: ARun[] = [
  { id: 'H1', name: 'Daily Footfall Summary', at: '14 Oct 2026, 07:00', by: 'Scheduler', size: '1.2 MB', format: 'PDF' },
  { id: 'H2', name: 'Device Health Digest', at: '14 Oct 2026, 06:00', by: 'Scheduler', size: '84 KB', format: 'CSV' },
  { id: 'H3', name: 'Queue SLA Report', at: '13 Oct 2026, 22:00', by: 'Scheduler', size: '640 KB', format: 'PDF' },
  { id: 'H4', name: 'Weekly Zone Performance', at: '12 Oct 2026, 08:00', by: 'Scheduler', size: '2.4 MB', format: 'XLSX' },
  { id: 'H5', name: 'Footfall & People Counting', at: '11 Oct 2026, 16:42', by: 'Rex Kumar', size: '1.8 MB', format: 'PDF' },
];

export interface AInsight { id: string; title: string; text: string; sev: 'high' | 'medium' | 'info'; zone: string; time: string; link: string; ack: boolean; }
export const INSIGHT_SEED: AInsight[] = [
  { id: 'I1', title: 'Food Court nearing capacity', text: 'Occupancy 80% and rising 6%/15 min. Open Food Court Orders C to keep wait under 6 min.', sev: 'high', zone: 'Food Court', time: '10:18 AM', link: 'queue-management', ack: false },
  { id: 'I2', title: 'Footfall peak at 3 PM forecast', text: 'Expected 1,900 visitors/hour (+18% vs last week) driven by the weekend sale event.', sev: 'medium', zone: 'All', time: '09:55 AM', link: 'footfall-people-counting', ack: false },
  { id: 'I3', title: 'Event Area camera accuracy dropped', text: 'CAM-05 accuracy 91.2% (target 97%). Lens obstruction suspected — calibration recommended.', sev: 'medium', zone: 'Event Area', time: '09:40 AM', link: 'device-management', ack: false },
  { id: 'I4', title: 'Repeat visitors up 9%', text: 'Loyalty campaign "Autumn Rewards" lifted repeat visits from 38% to 42% this week.', sev: 'info', zone: 'All', time: '08:30 AM', link: 'repeat-vs-new-visitors', ack: false },
  { id: 'I5', title: 'Retail Zone conversion below target', text: 'Conversion 22.4% vs 25% target. Dwell time is healthy (1h 26m) — check promotion visibility.', sev: 'info', zone: 'Retail Zone', time: '08:05 AM', link: 'conversion-engagement', ack: false },
];

export interface ACampaign { id: string; name: string; zone: string; channel: string; start: string; end: string; reach: number; engaged: number; converted: number; status: 'Active' | 'Scheduled' | 'Completed' | 'Paused'; }
export const CAMPAIGN_SEED: ACampaign[] = [
  { id: 'C1', name: 'Autumn Rewards', zone: 'Retail Zone', channel: 'Loyalty App', start: '2026-10-01', end: '2026-10-31', reach: 18420, engaged: 6240, converted: 1980, status: 'Active' },
  { id: 'C2', name: 'Food Court Combo Deals', zone: 'Food Court', channel: 'Digital Signage', start: '2026-10-05', end: '2026-10-20', reach: 14260, engaged: 5120, converted: 2364, status: 'Active' },
  { id: 'C3', name: 'Weekend Sale Event', zone: 'Event Area', channel: 'SMS + Signage', start: '2026-10-16', end: '2026-10-18', reach: 0, engaged: 0, converted: 0, status: 'Scheduled' },
  { id: 'C4', name: 'Movie Night Bundle', zone: 'Cinema', channel: 'Loyalty App', start: '2026-09-15', end: '2026-10-10', reach: 9640, engaged: 3810, converted: 1422, status: 'Completed' },
  { id: 'C5', name: 'Kids Play Pass', zone: 'Kids Zone', channel: 'Wi-Fi Portal', start: '2026-10-02', end: '2026-10-28', reach: 5280, engaged: 1690, converted: 512, status: 'Paused' },
];

export interface AMember { id: string; name: string; initials: string; color: string; segment: 'VIP' | 'Loyal' | 'Regular' | 'At Risk' | 'New'; visits: number; lastVisit: string; avgDwell: number; spend: number; fav: string; }
const FIRST = ['Aisha', 'Omar', 'Priya', 'Daniel', 'Lina', 'Rahul', 'Sara', 'Hassan', 'Maria', 'Yusuf', 'Chen', 'Nadia', 'Ahmed', 'Fatima', 'Leo', 'Zara', 'Imran', 'Sofia', 'Karim', 'Mei', 'Tariq', 'Elena', 'Bilal', 'Hana'];
const LAST = ['Khan', 'Farooq', 'Nair', 'Costa', 'Haddad', 'Mehta', 'Ali', 'Javed', 'Lopez', 'Rahman', 'Wei', 'Saeed'];
const SEGS: AMember['segment'][] = ['VIP', 'Loyal', 'Regular', 'Regular', 'At Risk', 'New', 'Loyal', 'Regular'];
const COLORS = ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f97316)', 'var(--ka-ec4899)', 'var(--ka-14b8a6)', 'var(--ka-eab308)', 'var(--ka-ef4444)'];
export const MEMBERS: AMember[] = Array.from({ length: 48 }, (_, i) => {
  const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 5) % LAST.length]}`;
  const segment = SEGS[i % SEGS.length];
  const visits = segment === 'VIP' ? 18 + (i % 9) : segment === 'Loyal' ? 9 + (i % 6) : segment === 'Regular' ? 4 + (i % 4) : segment === 'At Risk' ? 2 + (i % 3) : 1;
  return {
    id: `LM-${(10421 + i * 37).toString()}`, name, initials: name.split(' ').map((p) => p[0]).join(''), color: COLORS[i % COLORS.length], segment, visits,
    lastVisit: segment === 'At Risk' ? `${String(10 + (i % 18)).padStart(2, '0')} Sep 2026` : `${String(14 - (i % 7)).padStart(2, '0')} Oct 2026`,
    avgDwell: 40 + ((i * 17) % 90), spend: Math.round((visits * (120 + ((i * 53) % 260))) / 10) * 10, fav: ZONE_SEED[[1, 2, 6, 2, 1, 7, 5][i % 7]].name,
  };
});

/** Minutes → "1h 24m". */
export const fmtMin = (m: number) => {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? `${h}h ${String(r).padStart(2, '0')}m` : `${r}m`;
};
export const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');

@Injectable({ providedIn: 'root' })
export class AnalyticsStore {
  private readonly app = inject(AppState);
  readonly sites = A_SITES;
  readonly site = signal<ASite>(A_SITES[0]);
  readonly date = signal(A_DATES[0]);
  readonly range = signal<ARange>('Last 7 Days');
  readonly zones = signal<AZone[]>(ZONE_SEED.map((z) => ({ ...z })));
  readonly devices = signal<ADevice[]>(DEVICE_SEED.map((d) => ({ ...d })));
  readonly counters = signal<ACounter[]>(COUNTER_SEED.map((c) => ({ ...c })));
  readonly reports = signal<AReport[]>(REPORT_SEED.map((r) => ({ ...r })));
  readonly runs = signal<ARun[]>(RUN_SEED.map((r) => ({ ...r })));
  readonly insights = signal<AInsight[]>(INSIGHT_SEED.map((r) => ({ ...r })));
  readonly campaigns = signal<ACampaign[]>(CAMPAIGN_SEED.map((r) => ({ ...r })));
  readonly tick = this.app.tick;

  /** Day-to-day variation for historical dates (14 Oct = 1). */
  readonly dayFactor = computed(() => {
    const i = A_DATES.indexOf(this.date());
    return i <= 0 ? 1 : 0.86 + ((i * 37) % 23) / 100;
  });
  readonly isLive = computed(() => this.date() === A_DATES[0]);
  /** Site × date factor (used for "now" numbers). */
  readonly f = computed(() => this.site().factor * this.dayFactor());
  /** Site × date × range factor (used for period totals). */
  readonly fr = computed(() => this.f() * RANGE_MUL[this.range()]);

  readonly entries = computed(() => Math.round(6420 * this.fr()));
  readonly exits = computed(() => Math.round(6062 * this.fr()));
  readonly total = computed(() => this.entries() + this.exits());
  readonly capacity = computed(() => Math.round(this.zones().reduce((a, z) => a + z.capacity, 0) * this.site().factor));
  /** Live occupancy (wobbles while live). */
  readonly occupancy = computed(() => {
    const base = this.zones().reduce((a, z) => a + z.occ, 0) * this.f();
    return Math.max(0, Math.round(base + (this.isLive() ? this.app.wobble('occ', 6) : 0)));
  });
  readonly occPct = computed(() => Math.round((this.occupancy() / Math.max(1, this.capacity())) * 100));
  readonly avgDwell = computed(() => 84 * (0.96 + this.dayFactor() * 0.04));
  readonly perMin = computed(() => ({ in: 28 + (this.isLive() ? this.app.wobble('in', 3) : 0), out: 24 + (this.isLive() ? this.app.wobble('out', 3) : 0) }));

  /** Zones scaled to the current site/date, with live occupancy. */
  readonly zonesNow = computed(() =>
    this.zones().map((z) => {
      const occ = Math.max(0, Math.round(z.occ * this.f() + (this.isLive() ? this.app.wobble(z.id, Math.max(1, z.occ / 18)) : 0)));
      const cap = Math.round(z.capacity * this.site().factor);
      const pct = Math.round((occ / Math.max(1, cap)) * 100);
      return {
        ...z,
        entries: Math.round(z.entries * this.f()),
        exits: Math.round(z.exits * this.f()),
        occ,
        cap,
        pct,
        status: pct >= z.threshold ? 'Over Threshold' : pct >= z.threshold - 15 ? 'Busy' : 'Normal',
      };
    }),
  );
  readonly devCounts = computed(() => {
    const d = this.devices();
    return { total: d.length, online: d.filter((x) => x.status === 'Online').length, offline: d.filter((x) => x.status === 'Offline').length, warning: d.filter((x) => x.status === 'Warning').length };
  });
  readonly queueStats = computed(() => {
    const open = this.counters().filter((c) => c.open);
    const waiting = open.reduce((a, c) => a + c.waiting, 0);
    const avg = open.length ? open.reduce((a, c) => a + c.wait * c.waiting, 0) / Math.max(1, waiting) : 0;
    return { open: open.length, total: this.counters().length, waiting, avg, longest: open.reduce((m, c) => (c.wait > m.wait ? c : m), open[0] ?? this.counters()[0]) };
  });

  patchZone(id: string, ch: Partial<AZone>) {
    this.zones.update((l) => l.map((z) => (z.id === id ? { ...z, ...ch } : z)));
  }
  patchDevice(id: string, ch: Partial<ADevice>) {
    this.devices.update((l) => l.map((d) => (d.id === id ? { ...d, ...ch } : d)));
  }
  patchCounter(id: string, ch: Partial<ACounter>) {
    this.counters.update((l) => l.map((c) => (c.id === id ? { ...c, ...ch } : c)));
  }
  /** Adds a generated report to the history (shown on Reports & Insights). */
  logRun(name: string, format = 'PDF') {
    const now = new Date();
    const at = `${fmtDay(this.date())}, ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    this.runs.update((l) => [{ id: `H${Date.now()}`, name, at, by: 'Rex Kumar', size: `${(0.6 + Math.random() * 1.8).toFixed(1)} MB`, format }, ...l]);
  }
  ack(id: string) {
    this.insights.update((l) => l.map((i) => (i.id === id ? { ...i, ack: true } : i)));
  }
}
