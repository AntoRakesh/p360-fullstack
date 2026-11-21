// Hard-coded Safety & Wellbeing dataset + a root store shared by every safety page.
import { Injectable, computed, inject, signal } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { rng } from '@p360/shared/data/demo-data';

export type Sev = 'Critical' | 'High' | 'Medium' | 'Low';
export type IStatus = 'Open' | 'In Progress' | 'Responding' | 'Medical Assist' | 'Under Investigation' | 'Closed';
export const ACTIVE: IStatus[] = ['Open', 'In Progress', 'Responding', 'Medical Assist'];
export const I_STATUSES: IStatus[] = ['Open', 'In Progress', 'Responding', 'Medical Assist', 'Under Investigation', 'Closed'];
export const SEVS: Sev[] = ['Critical', 'High', 'Medium', 'Low'];

export const I_TYPES: Record<string, { icon: string; color: string }> = {
  'Fire Alarm': { icon: 'flame', color: 'var(--ka-ef4444)' },
  'Gas Leak': { icon: 's-gas', color: 'var(--ka-ef4444)' },
  'Person Fall': { icon: 's-fall', color: 'var(--ka-ef4444)' },
  'PPE Violation': { icon: 'hard-hat', color: 'var(--ka-f59e0b)' },
  'First Aid Case': { icon: 's-first-aid', color: 'var(--ka-22c55e)' },
  'Near Miss': { icon: 'triangle-alert', color: 'var(--ka-f59e0b)' },
  'Slip / Trip': { icon: 's-slip', color: 'var(--ka-f97316)' },
  'Chemical Spill': { icon: 's-flask', color: 'var(--ka-3b82f6)' },
  'Electrical Fault': { icon: 's-zap', color: 'var(--ka-3b82f6)' },
  'Equipment Damage': { icon: 's-cog', color: 'var(--ka-64748b)' },
  'Vehicle Incident': { icon: 'truck', color: 'var(--ka-7c3aed)' },
};
export const SITES = ['Head Office', 'Manufacturing Plant', 'Central Warehouse', 'Logistics Hub'];
export const FLOORS = ['Roof', 'Floor 5', 'Floor 4', 'Floor 3', 'Floor 2', 'Floor 1', 'Ground Floor', 'Basement'];
export const LOCATIONS = ['Production Area', 'Maintenance Room', 'Warehouse', 'Construction Area', 'Office Area', 'Loading Dock', 'Server Room', 'Main Entrance', 'Chemical Store', 'Canteen', 'Parking', 'Workshop'];
export const PEOPLE = [
  'Arjun Mehta', 'Priya Nair', 'Ravi Kumar', 'Maria Santos', 'Ahmed Hassan', 'Li Wei', 'Omar Khalid', 'Grace Park', 'Daniel Kim', 'Fatima Ali',
  'Tom Baker', 'Aisha Bello', 'Kenji Sato', 'Sofia Rossi', 'Vikram Rao', 'Hannah Lee', 'Yusuf Rahman', 'Meera Iyer', 'James Carter', 'Layla Haddad',
];
export const OFFICERS = ['Rex Kumar', 'Sarah Johnson', 'David Chen', 'Nadia Hussein', 'Ibrahim Musa'];
export const DEPTS = ['Production', 'Maintenance', 'Warehouse', 'Construction', 'Administration', 'IT', 'Logistics', 'Facilities'];
const PAL = ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0d9488)', 'var(--ka-ca8a04)', 'var(--ka-db2777)', 'var(--ka-16a34a)', 'var(--ka-ea580c)', 'var(--ka-475569)'];
export const initials = (n: string) => n.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
export const avatarColor = (n: string) => PAL[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length];

export const sevTag = (s: string) => (s === 'Critical' || s === 'High' ? 'sev red' : s === 'Medium' ? 'sev amber' : 'sev green');
export const stCls = (s: string) =>
  s === 'In Progress' ? 'st red' : s === 'Responding' ? 'st orange' : s === 'Medical Assist' ? 'st blue' : s === 'Open' ? 'st purple' : s === 'Closed' ? 'st green' : 'st grey';

/** Date label for "n days ago" relative to the demo date. */
export function dayLabel(daysAgo: number, base = new Date()) {
  const d = new Date(base);
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
export const nowTime = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

/* ---------------- Incidents ---------------- */
export interface Incident {
  id: string;
  type: string;
  title: string;
  location: string;
  site: string;
  floor: string;
  severity: Sev;
  status: IStatus;
  time: string;
  daysAgo: number;
  reportedBy: string;
  assignee: string;
  source: 'Sensor' | 'Camera AI' | 'Manual' | 'Wearable' | 'Mobile App';
  description: string;
  injured: number;
  involved: string[];
  rootCause?: string;
  lti?: boolean;
  log: { at: string; text: string; by: string }[];
}
const TODAY: Partial<Incident>[] = [
  { type: 'Fire Alarm', title: 'Fire alarm triggered – smoke detected', location: 'Production Area', floor: 'Floor 2', severity: 'High', status: 'In Progress', time: '10:24 AM', source: 'Sensor', reportedBy: 'Smoke Detector SD-2-14', assignee: 'Rex Kumar', injured: 0, involved: ['Arjun Mehta', 'Priya Nair', 'Ravi Kumar'], description: 'Smoke detector SD-2-14 triggered near packaging line 3. Fire team dispatched, partial evacuation of Floor 2 production in progress. 3 people nearby.' },
  { type: 'Gas Leak', title: 'LPG leak detected at boiler feed', location: 'Maintenance Room', floor: 'Ground Floor', severity: 'High', status: 'Responding', time: '10:18 AM', source: 'Sensor', reportedBy: 'Gas Sensor GS-G-03', assignee: 'David Chen', injured: 0, involved: ['Omar Khalid'], description: 'Gas sensor GS-G-03 reading 32% LEL. Supply valve isolated, area ventilated, maintenance team responding with portable detectors.' },
  { type: 'Person Fall', title: 'Worker slipped from ladder', location: 'Warehouse', floor: 'Ground Floor', severity: 'Medium', status: 'Medical Assist', time: '09:52 AM', source: 'Wearable', reportedBy: 'Wearable fall detection', assignee: 'Nadia Hussein', injured: 1, involved: ['Maria Santos'], description: 'Fall detected by wearable tag at Rack B-12. Worker conscious, complaining of ankle pain. First aider on site, ambulance on standby.' },
  { type: 'PPE Violation', title: 'No helmet in construction zone', location: 'Construction Area', floor: 'Floor 1', severity: 'Medium', status: 'Open', time: '08:47 AM', source: 'Camera AI', reportedBy: 'CAM-01 AI analytics', assignee: 'Sarah Johnson', injured: 0, involved: ['Ahmed Hassan'], description: 'AI camera detected a contractor without a hard hat in the Floor 1 construction zone for more than 2 minutes.' },
  { type: 'First Aid Case', title: 'Minor cut treated', location: 'Office Area', floor: 'Floor 3', severity: 'Low', status: 'Closed', time: '08:15 AM', source: 'Manual', reportedBy: 'Hannah Lee', assignee: 'Nadia Hussein', injured: 1, involved: ['Hannah Lee'], description: 'Minor cut from paper cutter, treated with first aid kit at reception. No further treatment required.', rootCause: 'Guard on paper cutter missing' },
  { type: 'Near Miss', title: 'Forklift near miss at dock door 4', location: 'Loading Dock', floor: 'Ground Floor', severity: 'Medium', status: 'Open', time: '07:32 AM', source: 'Mobile App', reportedBy: 'Tom Baker', assignee: 'Ibrahim Musa', injured: 0, involved: ['Tom Baker', 'Kenji Sato'], description: 'Forklift reversed without a spotter and came within 1 m of a pedestrian at dock door 4.' },
];
const OLD_TYPES = ['Near Miss', 'PPE Violation', 'Slip / Trip', 'First Aid Case', 'Equipment Damage', 'Chemical Spill', 'Electrical Fault', 'Person Fall', 'Vehicle Incident', 'Fire Alarm', 'Gas Leak'];
const ROOT = ['Inadequate training', 'Missing machine guard', 'Wet floor not signposted', 'PPE not worn', 'Procedure not followed', 'Poor housekeeping', 'Worn equipment', 'Inadequate lighting'];
export const INCIDENTS: Incident[] = (() => {
  const out: Incident[] = TODAY.map((t, i) => ({
    ...(t as Omit<Incident, 'id' | 'site' | 'daysAgo' | 'log'>),
    id: `INC-2026-${String(1042 - i).padStart(4, '0')}`,
    site: 'Head Office',
    daysAgo: 0,
    log: [{ at: t.time!, text: `Incident reported via ${t.source}`, by: t.reportedBy! }, ...(t.status !== 'Open' ? [{ at: t.time!, text: `Assigned to ${t.assignee}`, by: 'System' }] : [])],
  }));
  const r = rng(77);
  for (let i = 0; i < 36; i++) {
    const type = OLD_TYPES[i % OLD_TYPES.length];
    const daysAgo = 1 + Math.floor(i * 0.85);
    const sev: Sev = i % 11 === 3 ? 'Critical' : i % 4 === 0 ? 'High' : i % 3 === 0 ? 'Low' : 'Medium';
    const status: IStatus = i < 4 ? 'Under Investigation' : 'Closed';
    const h = 6 + Math.floor(r() * 12);
    const time = `${String(h > 12 ? h - 12 : h).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    const who = PEOPLE[(i * 7) % PEOPLE.length];
    out.push({
      id: `INC-2026-${String(1036 - i).padStart(4, '0')}`,
      type,
      title: `${type} – ${LOCATIONS[(i * 5) % LOCATIONS.length]}`,
      location: LOCATIONS[(i * 5) % LOCATIONS.length],
      site: SITES[i % 5 === 0 ? 1 : i % 7 === 0 ? 2 : 0],
      floor: FLOORS[4 + (i % 4)],
      severity: sev,
      status,
      time,
      daysAgo,
      reportedBy: who,
      assignee: OFFICERS[i % OFFICERS.length],
      source: (['Manual', 'Mobile App', 'Camera AI', 'Sensor', 'Wearable'] as const)[i % 5],
      description: `${type} reported by ${who}. Area made safe and supervisor informed.`,
      injured: type === 'First Aid Case' || type === 'Person Fall' || type === 'Slip / Trip' ? 1 : 0,
      involved: [who],
      rootCause: status === 'Closed' ? ROOT[i % ROOT.length] : undefined,
      lti: i === 17,
      log: [
        { at: time, text: 'Incident reported', by: who },
        { at: time, text: `Assigned to ${OFFICERS[i % OFFICERS.length]}`, by: 'System' },
        ...(status === 'Closed' ? [{ at: 'next day', text: `Closed – root cause: ${ROOT[i % ROOT.length]}`, by: OFFICERS[i % OFFICERS.length] }] : []),
      ],
    });
  }
  return out;
})();

/** Incident counts by hour (today, 3-hour buckets 12 AM–9 PM) for the trend chart. */
export const TREND_LABELS = ['12 AM', '2 AM', '4 AM', '6 AM', '8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM', '10 PM'];
export const TREND = {
  Total: [4, 7, 9, 10, 11, 12, 15, 14, 13, 14, 12, 11],
  High: [1, 2, 3, 2, 3, 4, 4, 3, 3, 4, 3, 2],
  Medium: [1, 1, 2, 2, 2, 2, 3, 2, 2, 2, 2, 1],
  Low: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
};
export const MONTHS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
export const MONTHLY = { Total: [38, 45, 41, 36, 44, 42], High: [6, 8, 7, 5, 7, 7], Medium: [17, 19, 18, 16, 20, 19], Low: [15, 18, 16, 15, 17, 16] };

/* ---------------- Hazards ---------------- */
export const H_CATS = ['Slips, Trips & Falls', 'PPE Non-Compliance', 'Machinery & Equipment', 'Chemical & Gas', 'Electrical', 'Fire Safety', 'Others'];
export const H_CAT_COLOR = ['var(--ka-ef4444)', 'var(--ka-f59e0b)', 'var(--ka-f59e0b)', 'var(--ka-3b82f6)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-9ca3af)'];
export const H_CAT_ICON = ['s-slip', 'hard-hat', 's-cog', 's-flask', 's-zap', 'flame', 'triangle-alert'];
export interface Hazard {
  id: string;
  title: string;
  category: string;
  location: string;
  floor: string;
  likelihood: number;
  impact: number;
  status: 'Open' | 'Mitigating' | 'Closed';
  owner: string;
  due: number; // days from today (negative = overdue)
  reportedBy: string;
  daysAgo: number;
  controls: { text: string; done: boolean }[];
  /** Fixed plan position for the featured hazards. */
  xy?: [number, number];
}
const HZ_XY: Record<number, [number, number]> = { 0: [216, 56], 12: [334, 98], 16: [362, 268] };
const HZ_TITLES: [string, number, string][] = [
  ['Oil spill near press line 2', 0, 'Production Area'], ['Damaged anti-slip tape on stairs', 0, 'Warehouse'], ['Trailing cables across walkway', 0, 'Office Area'],
  ['Hard hats not worn at scaffold', 1, 'Construction Area'], ['Missing hi-vis at dock', 1, 'Loading Dock'], ['Missing guard on lathe', 2, 'Workshop'],
  ['Forklift brake wear', 2, 'Warehouse'], ['Conveyor emergency stop faulty', 2, 'Production Area'], ['Unlabelled solvent drums', 3, 'Chemical Store'],
  ['Gas cylinder not chained', 3, 'Maintenance Room'], ['Overloaded power strip', 4, 'Server Room'], ['Exposed wiring in DB-3', 4, 'Maintenance Room'],
  ['Blocked fire exit (pallets)', 5, 'Warehouse'], ['Expired fire extinguisher', 5, 'Production Area'], ['Uneven paving at entrance', 6, 'Main Entrance'],
  ['Poor lighting in car park', 6, 'Parking'], ['Rack upright damage B-12', 2, 'Warehouse'], ['Wet floor at canteen', 0, 'Canteen'],
  ['Ladder with cracked rung', 0, 'Maintenance Room'], ['Noise above 85 dB at compressor', 6, 'Production Area'], ['Missing eye-wash signage', 3, 'Chemical Store'],
  ['Pallet wrap debris on floor', 0, 'Loading Dock'], ['Grinder used without goggles', 1, 'Workshop'], ['Heat build-up in plant room', 6, 'Maintenance Room'],
  ['Frayed extension lead', 4, 'Construction Area'], ['Sprinkler head obstructed', 5, 'Warehouse'], ['Open floor hatch unguarded', 0, 'Construction Area'],
  ['Spilled coolant at CNC-4', 3, 'Workshop'], ['Damaged dock leveller lip', 2, 'Loading Dock'], ['Missing machine LOTO tags', 2, 'Production Area'],
  ['Poor stacking height', 6, 'Warehouse'], ['Kitchen fryer fire blanket missing', 5, 'Canteen'],
];
export const HAZARDS: Hazard[] = HZ_TITLES.map(([title, c, loc], i) => {
  const status = i < 18 ? (i % 3 === 1 ? 'Mitigating' : 'Open') : 'Closed';
  const likelihood = 1 + ((i * 3 + 2) % 5);
  const impact = 1 + ((i * 2 + (c === 3 || c === 4 ? 3 : 1)) % 5);
  return {
    id: `HZ-${String(2210 - i)}`,
    title,
    category: H_CATS[c],
    location: loc,
    floor: HZ_XY[i] ? 'Floor 2' : FLOORS[5 + (i % 3)],
    xy: HZ_XY[i],
    likelihood,
    impact,
    status,
    owner: OFFICERS[i % OFFICERS.length],
    due: status === 'Closed' ? -10 : i % 5 === 0 ? -2 : 3 + (i % 9),
    reportedBy: PEOPLE[(i * 3) % PEOPLE.length],
    daysAgo: i % 12,
    controls: [
      { text: 'Barricade / signpost the area', done: true },
      { text: c === 1 ? 'Brief crew on PPE requirements' : 'Assign maintenance work order', done: status !== 'Open' },
      { text: 'Verify fix and close out', done: status === 'Closed' },
    ],
  };
});
export const riskScore = (h: Hazard) => h.likelihood * h.impact;
export const riskLevel = (s: number) => (s >= 15 ? 'Critical' : s >= 10 ? 'High' : s >= 5 ? 'Medium' : 'Low');

/* ---------------- Observations / near misses (this month feeds Top Hazard Categories) ---------------- */
export interface Observation {
  id: string;
  kind: 'Unsafe Act' | 'Unsafe Condition' | 'Near Miss' | 'Safe Behaviour';
  category: string;
  text: string;
  location: string;
  by: string;
  daysAgo: number;
  status: 'Reported' | 'Reviewed' | 'Action Assigned' | 'Closed';
  anonymous: boolean;
  potential: Sev;
  thisMonth: boolean;
}
const CAT_COUNTS = [28, 18, 14, 10, 8, 6, 12];
const OBS_TEXT: Record<string, string[]> = {
  'Slips, Trips & Falls': ['Wet floor without sign', 'Loose mat at entrance', 'Cable across walkway', 'Spilled oil near press', 'Uneven floor tile'],
  'PPE Non-Compliance': ['No helmet at scaffold', 'Gloves not worn handling sheets', 'No ear defenders near compressor', 'Safety glasses on forehead'],
  'Machinery & Equipment': ['Guard removed on lathe', 'Forklift horn not working', 'Conveyor e-stop sticky', 'Grinder disc worn'],
  'Chemical & Gas': ['Drum without label', 'Fume hood not running', 'Gas cylinder unchained'],
  Electrical: ['Exposed wires in panel', 'Overloaded socket', 'Damaged plug on drill'],
  'Fire Safety': ['Extinguisher blocked', 'Fire door wedged open', 'Exit sign light out'],
  Others: ['Poor lighting in stairwell', 'Housekeeping in break room', 'Heavy box lifted alone', 'Rushing on stairs'],
};
export const OBSERVATIONS: Observation[] = (() => {
  const out: Observation[] = [];
  let n = 0;
  H_CATS.forEach((cat, ci) => {
    for (let k = 0; k < CAT_COUNTS[ci]; k++) {
      const texts = OBS_TEXT[cat];
      const daysAgo = (n * 7 + ci) % 30;
      out.push({
        id: `OBS-${String(5400 - n)}`,
        kind: k % 5 === 0 ? 'Near Miss' : k % 3 === 0 ? 'Unsafe Act' : k % 4 === 1 && cat === 'Others' ? 'Safe Behaviour' : 'Unsafe Condition',
        category: cat,
        text: cat === 'Others' && k % 4 === 1 ? ['Helped colleague with correct lifting', 'Stopped job to fix hazard', 'Excellent housekeeping in bay 3'][k % 3] : texts[k % texts.length],
        location: LOCATIONS[(n * 3 + ci) % LOCATIONS.length],
        by: PEOPLE[(n * 11) % PEOPLE.length],
        daysAgo,
        status: daysAgo < 2 ? 'Reported' : daysAgo < 6 ? 'Reviewed' : daysAgo < 12 ? 'Action Assigned' : 'Closed',
        anonymous: n % 9 === 0,
        potential: k % 6 === 0 ? 'High' : k % 2 ? 'Medium' : 'Low',
        thisMonth: true,
      });
      n++;
    }
  });
  return out.sort((a, b) => a.daysAgo - b.daysAgo);
})();
export const LAST_MONTH_CATS = [24, 21, 11, 12, 9, 4, 10];
export const QUARTER_CATS = [79, 58, 39, 33, 26, 15, 34];

/* ---------------- People on site ---------------- */
export type PStatus = 'Safe' | 'In Hazard Zone' | 'Missing' | 'Medical Attention';
export interface SPerson {
  id: string;
  name: string;
  dept: string;
  status: PStatus;
  floor: string;
  zone: string;
  note: string;
  type: 'Employee' | 'Contractor' | 'Visitor';
}
const SP: [string, PStatus, string, string, string][] = [
  ['Arjun Mehta', 'In Hazard Zone', 'Floor 2', 'Production Area', 'Moving to Exit'],
  ['Priya Nair', 'In Hazard Zone', 'Floor 2', 'Production Area', 'Near fire zone'],
  ['Ravi Kumar', 'In Hazard Zone', 'Floor 2', 'Production Area', 'Evacuating via Stair B'],
  ['Omar Khalid', 'In Hazard Zone', 'Ground Floor', 'Maintenance Room', 'Gas leak zone'],
  ['Ahmed Hassan', 'In Hazard Zone', 'Floor 1', 'Construction Area', 'No helmet detected'],
  ['Kenji Sato', 'In Hazard Zone', 'Ground Floor', 'Loading Dock', 'Forklift proximity'],
  ['Li Wei', 'In Hazard Zone', 'Floor 2', 'Warehouse', 'Near hazard HZ-2207'],
  ['James Carter', 'In Hazard Zone', 'Floor 1', 'Construction Area', 'Working at height'],
  ['Yusuf Rahman', 'Missing', 'Floor 2', 'Production Area', 'Last seen 10:21 AM'],
  ['Layla Haddad', 'Missing', 'Floor 2', 'Server Room', 'Tag offline 6 min'],
  ['Daniel Kim', 'Missing', 'Basement', 'Plant Room', 'Last seen 10:05 AM'],
  ['Maria Santos', 'Medical Attention', 'Ground Floor', 'Warehouse', 'Fall – ankle injury'],
  ['Hannah Lee', 'Medical Attention', 'Floor 3', 'Office Area', 'Minor cut treated'],
  ['Vikram Rao', 'Medical Attention', 'Floor 2', 'Production Area', 'Smoke inhalation check'],
  ['Grace Park', 'Medical Attention', 'Ground Floor', 'Clinic', 'Heat stress'],
  ['Fatima Ali', 'Medical Attention', 'Floor 4', 'Office Area', 'Dizziness – resting'],
];
export const SAFE_PEOPLE_COUNT = 826;
export const AT_RISK: SPerson[] = SP.map(([name, status, floor, zone, note], i) => ({
  id: i === 0 ? 'EMP-00123' : `EMP-${String(200 + i * 37).padStart(5, '0')}`,
  name, status, floor, zone, note,
  dept: DEPTS[i % DEPTS.length],
  type: i % 5 === 4 ? 'Contractor' : 'Employee',
}));

/* ---------------- Wellbeing ---------------- */
export interface WAlert { id: string; person: string; kind: string; icon: string; detail: string; time: string; level: Sev; status: 'Open' | 'Acknowledged' | 'Resolved' }
export const W_ALERTS: WAlert[] = [
  { id: 'WB-301', person: 'Grace Park', kind: 'Heat Stress', icon: 's-thermo', detail: 'Core temp est. 38.4 °C · WBGT 31 at Loading Dock', time: '10:12 AM', level: 'High', status: 'Open' },
  { id: 'WB-302', person: 'Maria Santos', kind: 'Fatigue Risk', icon: 's-moon', detail: '13.5 h on shift, 2 short breaks', time: '09:40 AM', level: 'Medium', status: 'Open' },
  { id: 'WB-303', person: 'Ahmed Hassan', kind: 'Elevated Heart Rate', icon: 's-heart-pulse', detail: 'Wearable HR 148 bpm for 6 min', time: '09:05 AM', level: 'Medium', status: 'Open' },
  { id: 'WB-298', person: 'Tom Baker', kind: 'Lone Worker Check-in Missed', icon: 'user', detail: 'Missed 2-hourly check-in, called back OK', time: 'Yesterday', level: 'Low', status: 'Resolved' },
  { id: 'WB-295', person: 'Sofia Rossi', kind: 'Stress Survey Flag', icon: 's-brain', detail: 'Pulse survey score 2/10, EAP offered', time: 'Yesterday', level: 'Low', status: 'Resolved' },
];

/* ---------------- Environment ---------------- */
export interface EnvSensor { key: string; label: string; icon: string; unit: string; base: number; amp: number; dp: number; ok: (v: number) => string; color: string }
export const ENV: EnvSensor[] = [
  { key: 'temp', label: 'Temperature', icon: 's-thermo', unit: '°C', base: 24.5, amp: 0.3, dp: 1, ok: (v) => (v > 30 ? 'High' : 'Normal'), color: 'var(--ka-3b82f6)' },
  { key: 'hum', label: 'Humidity', icon: 's-droplet', unit: '%', base: 56, amp: 2, dp: 0, ok: (v) => (v > 70 ? 'High' : 'Normal'), color: 'var(--ka-2563eb)' },
  { key: 'aqi', label: 'Air Quality (AQI)', icon: 's-wind', unit: '', base: 42, amp: 3, dp: 0, ok: (v) => (v > 100 ? 'Poor' : v > 50 ? 'Moderate' : 'Good'), color: 'var(--ka-3b82f6)' },
  { key: 'noise', label: 'Noise Level', icon: 's-volume', unit: 'dB', base: 68, amp: 2, dp: 0, ok: (v) => (v > 85 ? 'High' : 'Normal'), color: 'var(--ka-7c3aed)' },
  { key: 'co', label: 'Gas (CO)', icon: 's-cloud', unit: 'ppm', base: 0, amp: 0, dp: 0, ok: (v) => (v > 25 ? 'High' : 'Normal'), color: 'var(--ka-7c3aed)' },
];
export const ENV_ALERTS = [
  { id: 'EA-1', text: 'CO₂ 1,250 ppm – Server Room', icon: 's-cloud', time: '10:20 AM', zone: 'Server Room' },
  { id: 'EA-2', text: 'Noise 91 dB – Compressor bay', icon: 's-volume', time: '10:02 AM', zone: 'Production Area' },
  { id: 'EA-3', text: 'Temperature 33 °C – Loading Dock', icon: 's-thermo', time: '09:48 AM', zone: 'Loading Dock' },
  { id: 'EA-4', text: 'LEL 32% – Maintenance Room', icon: 's-gas', time: '10:18 AM', zone: 'Maintenance Room' },
  { id: 'EA-5', text: 'PM2.5 78 µg/m³ – Construction', icon: 's-wind', time: '09:15 AM', zone: 'Construction Area' },
  { id: 'EA-6', text: 'Humidity 74% – Chemical Store', icon: 's-droplet', time: '08:30 AM', zone: 'Chemical Store' },
];

/* ---------------- PPE ---------------- */
export const PPE_TYPES = [
  { name: 'Hard Hat', icon: 'hard-hat', pct: 94, stock: 420, issued: 388 },
  { name: 'Hi-Vis Vest', icon: 's-vest', pct: 96, stock: 510, issued: 462 },
  { name: 'Safety Gloves', icon: 's-glove', pct: 88, stock: 1200, issued: 940 },
  { name: 'Safety Glasses', icon: 's-glasses', pct: 86, stock: 640, issued: 515 },
  { name: 'Safety Shoes', icon: 'run', pct: 97, stock: 300, issued: 284 },
  { name: 'Ear Protection', icon: 's-volume', pct: 89, stock: 800, issued: 610 },
];
export const PPE_ZONES = [
  { zone: 'Production Area', pct: 91, people: 214 }, { zone: 'Warehouse', pct: 93, people: 168 }, { zone: 'Construction Area', pct: 84, people: 62 },
  { zone: 'Loading Dock', pct: 90, people: 48 }, { zone: 'Maintenance Room', pct: 95, people: 22 }, { zone: 'Workshop', pct: 97, people: 35 },
];
export interface PpeEvent { id: string; time: string; daysAgo: number; cam: string; zone: string; missing: string; person: string; confidence: number; status: 'New' | 'Acknowledged' | 'Warning Issued' | 'Incident Raised' | 'False Positive' }
export const CAMERAS = [
  { id: 'CAM-01', name: 'Production Area - Cam 01', zone: 'Production Area', variant: 0, alert: 'No Helmet' },
  { id: 'CAM-02', name: 'Main Entrance - Cam 02', zone: 'Main Entrance', variant: 1, alert: '' },
  { id: 'CAM-03', name: 'Warehouse - Cam 03', zone: 'Warehouse', variant: 2, alert: 'Proximity Alert' },
  { id: 'CAM-04', name: 'Construction - Cam 04', zone: 'Construction Area', variant: 0, alert: 'No Vest' },
  { id: 'CAM-05', name: 'Loading Dock - Cam 05', zone: 'Loading Dock', variant: 2, alert: '' },
  { id: 'CAM-06', name: 'Workshop - Cam 06', zone: 'Workshop', variant: 1, alert: '' },
];
export const PPE_EVENTS: PpeEvent[] = (() => {
  const miss = ['Hard Hat', 'Hi-Vis Vest', 'Safety Glasses', 'Safety Gloves', 'Ear Protection'];
  const out: PpeEvent[] = [];
  for (let i = 0; i < 26; i++) {
    const cam = CAMERAS[i % CAMERAS.length];
    const h = 10 - Math.floor(i / 3);
    const hh = ((h + 24) % 12) || 12;
    out.push({
      id: `PPE-${7800 - i}`,
      time: i === 0 ? '10:22 AM' : `${String(hh).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')} ${h >= 12 || h < 0 ? 'PM' : 'AM'}`,
      daysAgo: i < 9 ? 0 : 1 + Math.floor((i - 9) / 4),
      cam: cam.id,
      zone: cam.zone,
      missing: i === 0 ? 'Hard Hat' : miss[(i * 3) % miss.length],
      person: i % 4 === 2 ? 'Unidentified' : PEOPLE[(i * 5 + 4) % PEOPLE.length],
      confidence: 86 + ((i * 7) % 13),
      status: i < 3 ? 'New' : i % 6 === 0 ? 'False Positive' : i % 4 === 0 ? 'Incident Raised' : i % 3 === 0 ? 'Acknowledged' : 'Warning Issued',
    });
  }
  return out;
})();

/* ---------------- Permits ---------------- */
export type PermitStatus = 'Requested' | 'Approved' | 'Active' | 'Suspended' | 'Closed' | 'Rejected';
export interface Permit { id: string; type: string; icon: string; title: string; location: string; floor: string; contractor: string; requestedBy: string; approver: string; start: string; end: string; workers: number; status: PermitStatus; checks: { text: string; done: boolean }[]; gas?: string }
const P_TYPES: [string, string][] = [['Hot Work', 'flame'], ['Confined Space', 'door-open'], ['Work at Height', 'arrow-up'], ['Electrical Isolation', 's-zap'], ['Excavation', 'toolbox'], ['Chemical Handling', 's-flask'], ['Lifting Operations', 'truck']];
const P_CHECKS: Record<string, string[]> = {
  'Hot Work': ['Fire watch assigned', 'Extinguisher within 5 m', 'Combustibles removed (10 m)', 'Smoke detectors isolated'],
  'Confined Space': ['Gas test O₂/LEL/H₂S/CO', 'Rescue team on standby', 'Ventilation running', 'Entrant log in place'],
  'Work at Height': ['Harness inspected', 'Anchor points certified', 'Exclusion zone below', 'Rescue plan briefed'],
  'Electrical Isolation': ['LOTO applied', 'Zero energy verified', 'Authorised electrician', 'Insulated tools'],
  Excavation: ['Utility scan done', 'Shoring in place', 'Barriers & signage', 'Spoil 1 m from edge'],
  'Chemical Handling': ['SDS reviewed', 'Spill kit available', 'Eye-wash tested', 'Chemical PPE worn'],
  'Lifting Operations': ['Lift plan approved', 'Rigging inspected', 'Banksman assigned', 'Load chart checked'],
};
const P_SEED: [number, string, string, string, PermitStatus][] = [
  [0, 'Welding on mezzanine frame', 'Production Area', 'BuildRight LLC', 'Active'], [1, 'Water tank inspection', 'Basement', 'TechServe FM', 'Active'],
  [2, 'Roof HVAC unit replacement', 'Roof', 'TechServe FM', 'Active'], [3, 'DB-3 panel rewiring', 'Maintenance Room', 'Spark Electricals', 'Active'],
  [4, 'Drainage trench – car park', 'Parking', 'BuildRight LLC', 'Approved'], [5, 'Solvent transfer to bund', 'Chemical Store', 'CleanPro Services', 'Requested'],
  [6, 'Crane lift – chiller unit', 'Loading Dock', 'Rapid Logistics', 'Requested'], [0, 'Pipe cutting – boiler room', 'Maintenance Room', 'TechServe FM', 'Suspended'],
  [2, 'Facade cleaning (BMU)', 'Roof', 'CleanPro Services', 'Approved'], [3, 'UPS battery swap', 'Server Room', 'Spark Electricals', 'Requested'],
  [0, 'Grinding rack brackets', 'Warehouse', 'BuildRight LLC', 'Closed'], [1, 'Sump pit cleaning', 'Basement', 'CleanPro Services', 'Closed'],
  [2, 'Lighting upgrade – warehouse', 'Warehouse', 'Spark Electricals', 'Closed'], [4, 'Cable trench – gate 2', 'Main Entrance', 'BuildRight LLC', 'Rejected'],
];
export const PERMITS: Permit[] = P_SEED.map(([t, title, loc, con, status], i) => {
  const [type, icon] = P_TYPES[t];
  return {
    id: `PTW-${String(3180 - i)}`,
    type, icon, title, location: loc,
    floor: loc === 'Roof' ? 'Roof' : loc === 'Basement' ? 'Basement' : FLOORS[4 + (i % 3)],
    contractor: con,
    requestedBy: PEOPLE[(i * 3 + 2) % PEOPLE.length],
    approver: OFFICERS[i % OFFICERS.length],
    start: status === 'Closed' ? dayLabel(2 + i % 3) + ' 08:00' : dayLabel(status === 'Requested' || status === 'Approved' ? -1 : 0) + ' 07:30',
    end: status === 'Closed' ? dayLabel(1 + i % 3) + ' 17:00' : dayLabel(status === 'Requested' || status === 'Approved' ? -1 : 0) + ' 17:00',
    workers: 2 + (i % 5),
    status,
    checks: P_CHECKS[type].map((text, k) => ({ text, done: status === 'Requested' ? k < 1 : status === 'Approved' ? k < 3 : true })),
    gas: t === 1 ? 'O₂ 20.8% · LEL 0% · H₂S 0 ppm · CO 2 ppm' : undefined,
  };
});

/* ---------------- Inspections ---------------- */
export interface Inspection { id: string; title: string; template: string; location: string; inspector: string; due: number; status: 'Scheduled' | 'In Progress' | 'Completed' | 'Overdue'; score?: number; findings: number; items: { q: string; r: 'Pass' | 'Fail' | 'N/A' | '' }[] }
export const TEMPLATES: Record<string, string[]> = {
  'Fire Safety Walkdown': ['Fire exits clear and signed', 'Extinguishers in date & sealed', 'Fire doors close fully', 'Alarm call points unobstructed', 'Emergency lighting working', 'Assembly point signage visible'],
  'Warehouse Racking': ['Uprights free of damage', 'Beam locks fitted', 'Load signs displayed', 'Aisles clear', 'Floor markings visible'],
  'Electrical Panels': ['Panels locked & labelled', '1 m clearance maintained', 'No exposed conductors', 'RCD test record current', 'Thermal scan within limits'],
  'Forklift Pre-Use': ['Brakes & horn working', 'Forks & chains undamaged', 'Lights & beacon OK', 'Seat belt fitted', 'No leaks'],
  'Housekeeping 5S': ['Walkways clear', 'Spills cleaned', 'Waste segregated', 'Tools stored', 'Lighting adequate'],
  'First Aid Kits': ['Kit sealed & stocked', 'AED charged', 'Eye-wash station flushed', 'First aider list posted'],
};
const T_NAMES = Object.keys(TEMPLATES);
export const INSPECTIONS: Inspection[] = Array.from({ length: 18 }, (_, i) => {
  const template = T_NAMES[i % T_NAMES.length];
  const status: Inspection['status'] = i < 3 ? 'Overdue' : i < 5 ? 'In Progress' : i < 11 ? 'Scheduled' : 'Completed';
  const items = TEMPLATES[template].map((q, k) => ({ q, r: (status === 'Completed' ? (k === (i % 5) && i % 2 ? 'Fail' : 'Pass') : status === 'In Progress' && k < 2 ? 'Pass' : '') as 'Pass' | 'Fail' | '' }));
  const fails = items.filter((x) => x.r === 'Fail').length;
  return {
    id: `INS-${String(640 + i)}`,
    title: `${template} – ${LOCATIONS[(i * 5) % LOCATIONS.length]}`,
    template,
    location: LOCATIONS[(i * 5) % LOCATIONS.length],
    inspector: OFFICERS[(i + 1) % OFFICERS.length],
    due: status === 'Overdue' ? -1 - (i % 3) : status === 'Completed' ? -(i - 9) : i - 4,
    status,
    score: status === 'Completed' ? Math.round(((items.length - fails) / items.length) * 100) : undefined,
    findings: fails,
    items,
  };
});

/* ---------------- Toolbox talks & training ---------------- */
export interface Talk { id: string; topic: string; presenter: string; location: string; daysAgo: number; time: string; duration: number; invited: number; attended: number; status: 'Scheduled' | 'Completed'; attendees: string[] }
const TOPICS = ['Working at Height', 'Fire Extinguisher Use', 'Manual Handling', 'Forklift Pedestrian Safety', 'Chemical Spill Response', 'Heat Stress Awareness', 'Lockout / Tagout', 'Slips, Trips & Falls', 'PPE Refresher', 'Emergency Evacuation', 'Ladder Safety', 'Mental Health First Aid'];
export const TALKS: Talk[] = TOPICS.map((topic, i) => {
  const status = i < 4 ? 'Scheduled' : 'Completed';
  const invited = 14 + ((i * 5) % 16);
  const attended = status === 'Completed' ? invited - (i % 4) : 0;
  return {
    id: `TBT-${410 + i}`,
    topic,
    presenter: OFFICERS[i % OFFICERS.length],
    location: LOCATIONS[(i * 2) % LOCATIONS.length],
    daysAgo: status === 'Scheduled' ? -(i + 1) : (i - 3) * 2,
    time: ['07:30 AM', '08:00 AM', '01:30 PM', '03:00 PM'][i % 4],
    duration: [15, 20, 30][i % 3],
    invited,
    attended,
    status,
    attendees: PEOPLE.slice(i % 6, (i % 6) + Math.min(attended, 8)),
  };
});
export const TRAINING = [
  { dept: 'Production', pct: 94, due: 6, overdue: 2 }, { dept: 'Maintenance', pct: 91, due: 4, overdue: 3 }, { dept: 'Warehouse', pct: 88, due: 9, overdue: 5 },
  { dept: 'Construction', pct: 82, due: 7, overdue: 6 }, { dept: 'Administration', pct: 97, due: 2, overdue: 0 }, { dept: 'Logistics', pct: 90, due: 5, overdue: 2 },
];
export const CERTS = [
  { person: 'Ahmed Hassan', cert: 'Working at Height', expires: 3 }, { person: 'Omar Khalid', cert: 'Confined Space Entry', expires: 6 },
  { person: 'Kenji Sato', cert: 'Forklift Licence', expires: 9 }, { person: 'Priya Nair', cert: 'First Aid at Work', expires: 12 },
  { person: 'James Carter', cert: 'Scaffold Inspection', expires: 18 }, { person: 'Li Wei', cert: 'Fire Warden', expires: 25 },
];

/* ---------------- Store ---------------- */
@Injectable({ providedIn: 'root' })
export class SafetyStore {
  private readonly app = inject(AppState);
  readonly incidents = signal<Incident[]>(INCIDENTS.map((x) => ({ ...x, log: [...x.log] })));
  readonly hazards = signal<Hazard[]>(HAZARDS.map((x) => ({ ...x, controls: x.controls.map((c) => ({ ...c })) })));
  readonly observations = signal<Observation[]>(OBSERVATIONS.map((x) => ({ ...x })));
  readonly atRisk = signal<SPerson[]>(AT_RISK.map((x) => ({ ...x })));
  readonly wAlerts = signal<WAlert[]>(W_ALERTS.map((x) => ({ ...x })));
  readonly envAlerts = signal(ENV_ALERTS.map((x) => ({ ...x, ack: false })));
  readonly ppeEvents = signal<PpeEvent[]>(PPE_EVENTS.map((x) => ({ ...x })));
  readonly permits = signal<Permit[]>(PERMITS.map((x) => ({ ...x, checks: x.checks.map((c) => ({ ...c })) })));
  readonly inspections = signal<Inspection[]>(INSPECTIONS.map((x) => ({ ...x, items: x.items.map((c) => ({ ...c })) })));
  readonly talks = signal<Talk[]>(TALKS.map((x) => ({ ...x })));
  /** Shared UI: report-incident modal, incident drawer and toast. */
  readonly reportOpen = signal<Partial<Incident> | null>(null);
  readonly openIncident = signal<string | null>(null);
  readonly toastMsg = signal<string | null>(null);
  /** Filter hand-off when navigating between pages (e.g. hazard category). */
  readonly hazardCat = signal<string | null>(null);
  readonly lockdown = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly active = computed(() => this.incidents().filter((i) => ACTIVE.includes(i.status)));
  readonly today = computed(() => this.incidents().filter((i) => i.daysAgo === 0));
  readonly openHazards = computed(() => this.hazards().filter((h) => h.status !== 'Closed'));
  readonly people = computed(() => {
    const list = this.atRisk();
    const c = (s: PStatus) => list.filter((p) => p.status === s).length;
    const zone = c('In Hazard Zone');
    const missing = c('Missing');
    const medical = c('Medical Attention');
    const safe = SAFE_PEOPLE_COUNT + (list.length - zone - missing - medical) + this.app.wobble('safe', 0);
    const total = safe + zone + missing + medical;
    return { total, safe, zone, missing, medical, pct: (n: number) => ((n / total) * 100).toFixed(1) };
  });
  readonly ppePct = computed(() => {
    const ev = this.ppeEvents().filter((e) => e.daysAgo === 0 && e.status !== 'False Positive').length;
    return Math.max(80, 92 + 3 - Math.round(ev / 3));
  });
  readonly openWAlerts = computed(() => this.wAlerts().filter((w) => w.status !== 'Resolved'));
  readonly openEnvAlerts = computed(() => this.envAlerts().filter((e) => !e.ack));
  /** Hazard reports this month by category (observations). */
  readonly catCounts = computed(() => H_CATS.map((c) => this.observations().filter((o) => o.thisMonth && o.category === c).length));

  incident(id: string | null) {
    return this.incidents().find((i) => i.id === id) ?? null;
  }
  addIncident(p: Partial<Incident>) {
    const n = Math.max(...this.incidents().map((i) => +i.id.slice(-4))) + 1;
    const inc: Incident = {
      id: `INC-2026-${String(n).padStart(4, '0')}`,
      type: p.type ?? 'Near Miss',
      title: p.title || `${p.type ?? 'Near Miss'} – ${p.location ?? 'Office Area'}`,
      location: p.location ?? 'Office Area',
      site: p.site ?? 'Head Office',
      floor: p.floor ?? 'Floor 2',
      severity: p.severity ?? 'Medium',
      status: 'Open',
      time: nowTime(),
      daysAgo: 0,
      reportedBy: 'Rex Kumar',
      assignee: p.assignee ?? 'Sarah Johnson',
      source: 'Manual',
      description: p.description || 'Reported from Safety Command Center.',
      injured: p.injured ?? 0,
      involved: p.involved ?? [],
      log: [{ at: nowTime(), text: 'Incident reported via Safety Command Center', by: 'Rex Kumar' }],
    };
    this.incidents.update((l) => [inc, ...l]);
    return inc;
  }
  updateIncident(id: string, patch: Partial<Incident>, logText?: string) {
    this.incidents.update((l) =>
      l.map((i) => (i.id === id ? { ...i, ...patch, log: logText ? [...i.log, { at: nowTime(), text: logText, by: 'Rex Kumar' }] : i.log } : i)),
    );
  }
  updateHazard(id: string, patch: Partial<Hazard>) {
    this.hazards.update((l) => l.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }
  addHazard(h: Omit<Hazard, 'id'>) {
    const n = Math.max(...this.hazards().map((x) => +x.id.slice(3))) + 1;
    const hz = { ...h, id: `HZ-${n}` };
    this.hazards.update((l) => [hz, ...l]);
    return hz;
  }
  addObservation(o: Omit<Observation, 'id'>) {
    const n = Math.max(...this.observations().map((x) => +x.id.slice(4))) + 1;
    const ob = { ...o, id: `OBS-${n}` };
    this.observations.update((l) => [ob, ...l]);
    return ob;
  }
  setPerson(id: string, status: PStatus, note: string) {
    this.atRisk.update((l) => l.map((p) => (p.id === id ? { ...p, status, note } : p)));
  }
  toast(m: string) {
    this.toastMsg.set(m);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.toastMsg.set(null), 2800);
  }
}
