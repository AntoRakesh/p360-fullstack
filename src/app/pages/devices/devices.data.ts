// Hard-coded Device & Edge Management dataset + a root store shared by all device pages.
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { rng } from '../dashboards/demo-data';

export type DType = 'Access Point' | 'Switch' | 'Camera' | 'IoT Sensor' | 'Gateway' | 'Other';
export type DStatus = 'Online' | 'Offline' | 'Maintenance' | 'Inactive';
export interface Device {
  id: string;
  name: string;
  type: DType;
  model: string;
  vendor: string;
  serial: string;
  mac: string;
  ip: string;
  site: string;
  location: string;
  dept: string;
  owner: string;
  status: DStatus;
  /** Minutes before demo "now" (14 Oct 2026 10:24 AM). */
  seenAgo: number;
  firmware: string;
  fwUpdated: string;
  uptimeH: number;
  cpu: number;
  mem: number;
  temp: number;
  rssi: number;
  latency: number;
  health: number;
  gateway: string;
  installed: string;
  warranty: string;
  profile: string;
  /** Position on the floor map (0..100). */
  x: number;
  y: number;
}

export const DEMO_NOW = new Date(2026, 9, 14, 10, 24);
export const TYPES: DType[] = ['Access Point', 'Switch', 'Camera', 'IoT Sensor', 'Gateway', 'Other'];
export const TYPE_META: Record<DType, { color: string; icon: string; short: string; plural: string; prefix: string; models: string[]; vendor: string; latest: string }> = {
  'Access Point': { color: 'var(--ka-3b82f6)', icon: 'devices-ap', short: 'AP', plural: 'Access Points', prefix: 'AP', models: ['AP4060', 'AP5020', 'AP305C', 'AP650'], vendor: 'Extreme Networks', latest: '10.4.2' },
  Switch: { color: 'var(--ka-22c55e)', icon: 'devices-switch', short: 'Switch', plural: 'Switches', prefix: 'SW', models: ['S3528', 'S4220', 'S5520'], vendor: 'Extreme Networks', latest: '8.6.1' },
  Camera: { color: 'var(--ka-f97316)', icon: 'devices-camera', short: 'Camera', plural: 'Cameras', prefix: 'CAM', models: ['MS-C536', 'MS-C296', 'MS-C8165'], vendor: 'Milesight', latest: '5.2.0' },
  'IoT Sensor': { color: 'var(--ka-f59e0b)', icon: 'devices-thermo', short: 'IoT Sensor', plural: 'IoT Sensors', prefix: 'TEMP', models: ['EM300-TH', 'AM307', 'WS301'], vendor: 'Milesight IoT', latest: '1.3.4' },
  Gateway: { color: 'var(--ka-8b5cf6)', icon: 'devices-gateway', short: 'Gateway', plural: 'Gateways', prefix: 'GW', models: ['UG63', 'UG65', 'UG67'], vendor: 'Milesight IoT', latest: '60.0.0.44' },
  Other: { color: 'var(--ka-94a3b8)', icon: 'devices-chip', short: 'Other', plural: 'Other', prefix: 'DEV', models: ['RDR-200', 'KSK-10', 'PNL-4'], vendor: 'Various', latest: '2.1.0' },
};
/** Donut colours exactly as the reference (AP blue, Switch purple, Camera teal, IoT orange, Gateway red, Other salmon). */
export const DONUT_COLORS: Record<DType, string> = {
  'Access Point': 'var(--ka-2f80ed)', Switch: 'var(--ka-7c3aed)', Camera: 'var(--ka-10b981)', 'IoT Sensor': 'var(--ka-f59e0b)', Gateway: 'var(--ka-ef4444)', Other: 'var(--ka-f4a28c)',
};
export const SITES = ['HQ', 'Warehouse', 'Factory', 'Branch', 'Parking', 'Office'];
export const DEPTS = ['IT', 'Security', 'Facilities', 'Operations'];
export const OWNERS: Record<string, string> = { IT: 'Network Team', Security: 'Security Ops', Facilities: 'Facilities Team', Operations: 'OT Engineering' };
const LOCS: Record<string, string[]> = {
  HQ: ['Building A - Floor 1', 'Building A - Floor 2', 'Building A - Floor 3', 'Bldg A - Roof', 'Building B - Lobby', 'Server Room'],
  Warehouse: ['Warehouse - Entrance', 'Warehouse - Zone A', 'Warehouse - Zone B', 'Loading Dock'],
  Factory: ['Production Line 1', 'Production Line 2', 'Cold Storage', 'Assembly Hall'],
  Branch: ['Floor 3 - Office', 'Floor 1 - IDC', 'Floor 2 - Meeting'],
  Parking: ['Main Gate', 'Level P1', 'Level P2'],
  Office: ['Floor 5 - Open Area', 'Floor 4 - Finance', 'Floor 5 - Pantry'],
};
// Per type: [online, offline, maintenance, inactive] — totals match the KPI cards.
const SPLIT: Record<DType, [number, number, number, number]> = {
  'Access Point': [372, 20, 12, 8], Switch: [240, 16, 8, 4], Camera: [165, 16, 9, 8], 'IoT Sensor': [118, 14, 4, 6], Gateway: [88, 4, 2, 2], Other: [119, 8, 1, 4],
};
/** Device Status chart values from the reference snapshot (per type: online/offline/maintenance). */
export const STATUS_SNAPSHOT: Record<string, [number, number, number]> = {
  AP: [362, 28, 12], Switch: [218, 32, 8], Camera: [165, 20, 13], 'IoT Sensor': [128, 14, 7], Gateway: [92, 6, 4],
};

const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
function mk(p: Partial<Device> & Pick<Device, 'id' | 'name' | 'type' | 'model' | 'serial' | 'site' | 'location' | 'status' | 'seenAgo'>, r: () => number): Device {
  const m = TYPE_META[p.type];
  const dept = p.dept ?? (p.type === 'Camera' ? 'Security' : p.type === 'IoT Sensor' ? 'Facilities' : p.type === 'Other' ? DEPTS[Math.floor(r() * 4)] : 'IT');
  const n = Math.floor(r() * 250);
  const off = p.status !== 'Online';
  return {
    vendor: m.vendor,
    mac: `00:1A:${hex(Math.floor(r() * 256))}:${hex(Math.floor(r() * 256))}:${hex(Math.floor(r() * 256))}:${hex(Math.floor(r() * 256))}`,
    ip: `10.${10 + SITES.indexOf(p.site)}.${20 + Math.floor(r() * 30)}.${n + 2}`,
    dept,
    owner: OWNERS[dept],
    firmware: r() < 0.78 ? m.latest : m.latest.replace(/\d+$/, (d) => String(Math.max(0, +d - 1 - Math.floor(r() * 2)))),
    fwUpdated: `${String(1 + Math.floor(r() * 28)).padStart(2, '0')} ${['Aug', 'Sep', 'Oct'][Math.floor(r() * 3)]} 2026`,
    uptimeH: off ? 0 : Math.floor(24 + r() * 900),
    cpu: off ? 0 : Math.round(12 + r() * 60),
    mem: off ? 0 : Math.round(28 + r() * 55),
    temp: Math.round(34 + r() * 26),
    rssi: -Math.round(42 + r() * 38),
    latency: Math.round(2 + r() * 30),
    health: p.status === 'Online' ? Math.round(80 + r() * 20) : p.status === 'Maintenance' ? Math.round(55 + r() * 20) : Math.round(10 + r() * 30),
    gateway: `GW-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}`,
    installed: `${String(1 + Math.floor(r() * 28)).padStart(2, '0')} ${['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'][Math.floor(r() * 6)]} ${2022 + Math.floor(r() * 4)}`,
    warranty: `${['Jan', 'Apr', 'Jun', 'Dec'][Math.floor(r() * 4)]} ${2027 + Math.floor(r() * 3)}`,
    profile: `${m.short} - ${['Corporate', 'Standard', 'High Density', 'Secure'][Math.floor(r() * 4)]}`,
    x: 8 + r() * 84,
    y: 8 + r() * 84,
    ...p,
  } as Device;
}

function seed(): Device[] {
  const r = rng(4060);
  const head: Device[] = [
    mk({ id: 'D1', name: 'AP-4060-01', type: 'Access Point', model: 'AP4060', serial: 'SN123456789', mac: '00:1A:2B:3C:4D:5E', ip: '10.10.20.34', site: 'HQ', location: 'Building A - Floor 2', status: 'Online', seenAgo: 6, firmware: '10.4.1', fwUpdated: '05 Oct 2026', uptimeH: 294, dept: 'IT', owner: 'Network Team', x: 50, y: 50 }, r),
    mk({ id: 'D2', name: 'SW-3528-01', type: 'Switch', model: 'S3528', serial: 'SN987654321', site: 'HQ', location: 'Building A - Floor 1', status: 'Online', seenAgo: 8, x: 22, y: 30 }, r),
    mk({ id: 'D3', name: 'CAM-01', type: 'Camera', model: 'MS-C536', serial: 'SN112233445', site: 'Warehouse', location: 'Warehouse - Entrance', status: 'Online', seenAgo: 9, x: 15, y: 14 }, r),
    mk({ id: 'D4', name: 'TEMP-01', type: 'IoT Sensor', model: 'EM300-TH', serial: 'SN556677889', site: 'Factory', location: 'Production Line 1', status: 'Offline', seenAgo: 822, x: 24, y: 58 }, r),
    mk({ id: 'D5', name: 'GW-01', type: 'Gateway', model: 'UG63', serial: 'SN998877665', site: 'HQ', location: 'Bldg A - Roof', status: 'Maintenance', seenAgo: 34, x: 74, y: 64 }, r),
    mk({ id: 'D6', name: 'AP-5020-03', type: 'Access Point', model: 'AP5020', serial: 'SN667788990', site: 'Branch', location: 'Floor 3 - Office', status: 'Online', seenAgo: 12, x: 60, y: 44 }, r),
    mk({ id: 'D7', name: 'SW-4220-02', type: 'Switch', model: 'S4220', serial: 'SN334455667', site: 'Branch', location: 'Floor 1 - IDC', status: 'Online', seenAgo: 14, x: 40, y: 72 }, r),
    mk({ id: 'D8', name: 'CAM-12', type: 'Camera', model: 'MS-C296', serial: 'SN778899001', site: 'Parking', location: 'Main Gate', status: 'Online', seenAgo: 16, x: 54, y: 88 }, r),
    mk({ id: 'D9', name: 'AP-305C-07', type: 'Access Point', model: 'AP305C', serial: 'SN223344556', site: 'Office', location: 'Floor 5 - Open Area', status: 'Online', seenAgo: 19, x: 86, y: 18 }, r),
  ];
  const out = [...head];
  const counters: Record<string, number> = {};
  for (const t of TYPES) {
    const used = head.filter((d) => d.type === t);
    const pool: DStatus[] = [];
    const [on, of, mn, ina] = SPLIT[t];
    const take = (s: DStatus, n: number) => {
      const already = used.filter((d) => d.status === s).length;
      for (let i = 0; i < n - already; i++) pool.push(s);
    };
    take('Online', on); take('Offline', of); take('Maintenance', mn); take('Inactive', ina);
    // shuffle deterministically
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const m = TYPE_META[t];
    pool.forEach((status, i) => {
      const model = m.models[Math.floor(r() * m.models.length)];
      const site = SITES[Math.floor(r() * SITES.length)];
      const loc = LOCS[site][Math.floor(r() * LOCS[site].length)];
      counters[t] = (counters[t] ?? 20) + 1;
      const num = String(counters[t]).padStart(2, '0');
      const name = t === 'Access Point' || t === 'Switch' ? `${m.prefix}-${model.replace(/^[A-Z]+/, '')}-${num}` : t === 'IoT Sensor' ? `${['TEMP', 'IAQ', 'LEAK'][i % 3]}-${num}` : `${m.prefix}-${num}`;
      const seenAgo = status === 'Online' ? Math.floor(r() * 40) + 1 : status === 'Maintenance' ? Math.floor(r() * 300) + 20 : Math.floor(r() * 4000) + 60;
      out.push(mk({ id: `D${out.length + 1}`, name, type: t, model, serial: `SN${Math.floor(100000000 + r() * 899999999)}`, site, location: loc, status, seenAgo }, r));
    });
  }
  // interleave so the list is not grouped by type after the first 9 rows
  const rest = out.slice(9);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return [...head, ...rest];
}
export const DEVICES_SEED = seed();

export function fmtSeen(ago: number, now = DEMO_NOW) {
  const d = new Date(now.getTime() - ago * 60000);
  const mon = d.toLocaleString('en-US', { month: 'short' });
  const t = d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${String(d.getDate()).padStart(2, '0')} ${mon} ${d.getFullYear()} ${t}`;
}
export function fmtUptime(h: number) {
  if (!h) return '—';
  return `${Math.floor(h / 24)} days, ${h % 24} hours`;
}
export function statusCls(s: string) {
  return s === 'Online' ? 'green' : s === 'Offline' ? 'red' : s === 'Maintenance' ? 'amber' : 'grey';
}

/* ---------- Alerts ---------- */
export type Sev = 'Critical' | 'High' | 'Medium' | 'Low';
export interface DAlert {
  id: string;
  deviceId: string;
  device: string;
  type: DType;
  site: string;
  title: string;
  sev: Sev;
  ago: number;
  state: 'Open' | 'Acknowledged' | 'Resolved';
  assignee: string;
  category: 'Connectivity' | 'Hardware' | 'Firmware' | 'Security' | 'Environment' | 'Performance';
}
const ALERT_TPL: [string, DAlert['category'], Sev][] = [
  ['Device offline > 15 min', 'Connectivity', 'Critical'],
  ['High CPU utilisation (92%)', 'Performance', 'High'],
  ['PoE budget exceeded on port 14', 'Hardware', 'High'],
  ['Temperature above threshold (61°C)', 'Environment', 'Critical'],
  ['Firmware out of date (2 versions)', 'Firmware', 'Medium'],
  ['Rogue AP detected on SSID Corp-WiFi', 'Security', 'Critical'],
  ['Packet loss 8% on uplink', 'Connectivity', 'High'],
  ['Battery low (12%)', 'Hardware', 'Medium'],
  ['Camera video loss', 'Hardware', 'Critical'],
  ['Unauthorised config change', 'Security', 'High'],
  ['Link flapping on uplink port', 'Connectivity', 'Medium'],
  ['Certificate expires in 7 days', 'Security', 'Low'],
];
export const ASSIGNEES = ['Unassigned', 'Rex Kumar', 'Network Team', 'Security Ops', 'Facilities Team', 'OT Engineering'];
function seedAlerts(devs: Device[]): DAlert[] {
  const r = rng(32);
  const bad = devs.filter((d) => d.status !== 'Online' && d.status !== 'Inactive');
  const list: DAlert[] = [];
  for (let i = 0; i < 58; i++) {
    const d = i === 0 ? devs[3] : i === 1 ? devs[4] : i < 30 ? bad[Math.floor(r() * bad.length)] : devs[Math.floor(r() * 300)];
    const [title, category, sev0] = i === 0 ? ALERT_TPL[0] : i === 1 ? ALERT_TPL[4] : ALERT_TPL[Math.floor(r() * ALERT_TPL.length)];
    const sev: Sev = i < 32 ? 'Critical' : sev0 === 'Critical' ? 'High' : sev0;
    const state: DAlert['state'] = i < 32 ? (i % 5 === 4 ? 'Acknowledged' : 'Open') : i < 46 ? 'Acknowledged' : 'Resolved';
    list.push({ id: `ALT-${String(9420 - i)}`, deviceId: d.id, device: d.name, type: d.type, site: d.site, title: i < 32 && sev0 !== 'Critical' ? ALERT_TPL[[0, 3, 5, 8][i % 4]][0] : title, sev, ago: Math.floor(i * 9 + r() * 8), state, assignee: state === 'Open' && i % 3 ? 'Unassigned' : ASSIGNEES[1 + (i % 5)], category: i < 32 && sev0 !== 'Critical' ? ALERT_TPL[[0, 3, 5, 8][i % 4]][1] : category });
  }
  return list;
}

/* ---------- Firmware campaigns ---------- */
export interface Campaign {
  id: string;
  name: string;
  type: DType;
  from: string;
  to: string;
  total: number;
  /** stage index into STAGES; 4 = complete */
  stage: number;
  done: number;
  failed: number;
  paused: boolean;
  started: string;
  window: string;
  owner: string;
}
export const STAGES = [
  { name: 'Pilot', pct: 5 },
  { name: 'Early Adopters', pct: 25 },
  { name: 'Broad', pct: 60 },
  { name: 'Full Fleet', pct: 100 },
];
export const RELEASES = [
  { type: 'Access Point' as DType, version: '10.4.2', date: '09 Oct 2026', notes: 'Wi-Fi 6E roaming fixes, CVE-2026-3121 patch', severity: 'Security' },
  { type: 'Switch' as DType, version: '8.6.1', date: '02 Oct 2026', notes: 'PoE++ budget handling, LLDP-MED improvements', severity: 'Recommended' },
  { type: 'Camera' as DType, version: '5.2.0', date: '28 Sep 2026', notes: 'H.265+ smart codec, ONVIF Profile T', severity: 'Feature' },
  { type: 'IoT Sensor' as DType, version: '1.3.4', date: '20 Sep 2026', notes: 'Battery life +18%, LoRaWAN ADR fix', severity: 'Recommended' },
  { type: 'Gateway' as DType, version: '60.0.0.44', date: '12 Sep 2026', notes: 'Edge runtime 3.2, MQTT 5 bridge', severity: 'Security' },
  { type: 'Other' as DType, version: '2.1.0', date: '30 Aug 2026', notes: 'Reader OSDP v2 secure channel', severity: 'Feature' },
];

/* ---------- Edge gateways ---------- */
export interface EdgeApp { name: string; version: string; status: 'Running' | 'Stopped' | 'Restarting'; cpu: number; mem: number }
export interface EdgeGw {
  id: string;
  name: string;
  site: string;
  location: string;
  model: string;
  status: DStatus;
  devices: number;
  cpu: number;
  mem: number;
  disk: number;
  uplink: 'Ethernet' | 'LTE' | 'Wi-Fi';
  throughput: number;
  apps: EdgeApp[];
  buffer: number;
  lastSync: number;
}
const APPS: [string, string][] = [['mqtt-bridge', '2.4.1'], ['lorawan-ns', '1.9.0'], ['video-analytics', '3.1.2'], ['modbus-collector', '1.2.7'], ['rtls-engine', '4.0.3'], ['opc-ua-client', '1.0.9']];
function seedGateways(devs: Device[]): EdgeGw[] {
  const r = rng(96);
  return Array.from({ length: 12 }, (_, i) => {
    const d = devs.filter((x) => x.type === 'Gateway')[i];
    const status: DStatus = i === 0 ? 'Maintenance' : i === 7 ? 'Offline' : 'Online';
    const apps = APPS.filter((_, k) => (i + k) % 3 !== 2).map(([name, version], k) => ({ name, version, status: (status === 'Offline' ? 'Stopped' : i === 4 && k === 1 ? 'Stopped' : 'Running') as EdgeApp['status'], cpu: Math.round(3 + r() * 22), mem: Math.round(60 + r() * 400) }));
    return {
      id: `GW-${String(i + 1).padStart(2, '0')}`,
      name: i === 0 ? 'GW-01' : `GW-${String(i + 1).padStart(2, '0')}`,
      site: i === 0 ? 'HQ' : SITES[i % SITES.length],
      location: i === 0 ? 'Bldg A - Roof' : d?.location ?? 'Server Room',
      model: i === 0 ? 'UG63' : ['UG65', 'UG67', 'UG63'][i % 3],
      status,
      devices: Math.round(40 + r() * 120),
      cpu: status === 'Offline' ? 0 : Math.round(18 + r() * 60),
      mem: status === 'Offline' ? 0 : Math.round(30 + r() * 55),
      disk: Math.round(22 + r() * 60),
      uplink: (['Ethernet', 'Ethernet', 'LTE', 'Wi-Fi'] as const)[i % 4],
      throughput: Math.round(4 + r() * 60),
      apps,
      buffer: status === 'Offline' ? 18420 : Math.round(r() * 300),
      lastSync: status === 'Offline' ? 214 : Math.floor(r() * 3),
    };
  });
}

/* ---------- Configuration profiles ---------- */
export interface ConfigProfile {
  id: string;
  name: string;
  type: DType;
  version: number;
  updated: string;
  by: string;
  devices: number;
  drift: number;
  settings: Record<string, string>;
  history: { v: number; date: string; by: string; note: string }[];
}
const PROFILES: ConfigProfile[] = ([
  { id: 'P1', name: 'AP - Corporate', type: 'Access Point', version: 14, updated: '12 Oct 2026', by: 'Rex Kumar', devices: 218, drift: 4, settings: { SSID: 'Corp-WiFi', Security: 'WPA3-Enterprise', VLAN: '20', 'Band Steering': 'On', 'Tx Power': 'Auto', 'Channel Width': '80 MHz' }, history: [] },
  { id: 'P2', name: 'AP - High Density', type: 'Access Point', version: 6, updated: '30 Sep 2026', by: 'Network Team', devices: 104, drift: 2, settings: { SSID: 'Corp-WiFi', Security: 'WPA3-Enterprise', VLAN: '20', 'Band Steering': 'On', 'Tx Power': 'Medium', 'Channel Width': '40 MHz' }, history: [] },
  { id: 'P3', name: 'AP - Guest', type: 'Access Point', version: 9, updated: '18 Sep 2026', by: 'Network Team', devices: 90, drift: 0, settings: { SSID: 'Guest-WiFi', Security: 'WPA2-PSK + Captive Portal', VLAN: '90', 'Band Steering': 'Off', 'Tx Power': 'Low', 'Channel Width': '20 MHz' }, history: [] },
  { id: 'P4', name: 'Switch - Access Layer', type: 'Switch', version: 22, updated: '10 Oct 2026', by: 'Rex Kumar', devices: 196, drift: 7, settings: { 'Mgmt VLAN': '10', 'PoE Mode': '802.3bt', STP: 'RSTP', 'Port Security': 'Enabled', 'LLDP-MED': 'On', 'Storm Control': '5%' }, history: [] },
  { id: 'P5', name: 'Switch - Core', type: 'Switch', version: 11, updated: '01 Oct 2026', by: 'Network Team', devices: 72, drift: 1, settings: { 'Mgmt VLAN': '10', 'PoE Mode': 'Off', STP: 'MSTP', 'Port Security': 'Disabled', 'LLDP-MED': 'On', 'Storm Control': '10%' }, history: [] },
  { id: 'P6', name: 'Camera - 1080p H.265', type: 'Camera', version: 8, updated: '08 Oct 2026', by: 'Security Ops', devices: 158, drift: 3, settings: { Resolution: '1920×1080', Codec: 'H.265+', FPS: '25', Bitrate: '4 Mbps', 'Night Mode': 'Auto IR', Retention: '30 days' }, history: [] },
  { id: 'P7', name: 'Camera - 4K Perimeter', type: 'Camera', version: 3, updated: '22 Sep 2026', by: 'Security Ops', devices: 40, drift: 0, settings: { Resolution: '3840×2160', Codec: 'H.265+', FPS: '20', Bitrate: '8 Mbps', 'Night Mode': 'Colour', Retention: '45 days' }, history: [] },
  { id: 'P8', name: 'IoT - Environment 5 min', type: 'IoT Sensor', version: 5, updated: '15 Sep 2026', by: 'Facilities Team', devices: 142, drift: 2, settings: { 'Report Interval': '5 min', 'Temp Alarm': '> 30°C', 'Humidity Alarm': '> 70%', Network: 'LoRaWAN EU868', ADR: 'On', Confirmed: 'Off' }, history: [] },
  { id: 'P9', name: 'Gateway - Edge Standard', type: 'Gateway', version: 12, updated: '11 Oct 2026', by: 'OT Engineering', devices: 96, drift: 1, settings: { 'MQTT Broker': 'mqtts://iot.people360.io', 'Buffer Size': '2 GB', 'Sync Interval': '30 s', Uplink: 'Ethernet + LTE failover', NTP: 'pool.ntp.org', 'Remote SSH': 'Disabled' }, history: [] },
] as ConfigProfile[]).map((p) => ({ ...p, history: [
  { v: p.version, date: p.updated, by: p.by, note: 'Tuned settings after site survey' },
  { v: p.version - 1, date: '14 Aug 2026', by: 'Network Team', note: 'Security hardening baseline' },
  { v: p.version - 2, date: '02 Jul 2026', by: 'Rex Kumar', note: 'Initial rollout' },
] }));

/* ---------- RMA / replacement ---------- */
export interface Rma {
  id: string;
  deviceId: string;
  device: string;
  type: DType;
  model: string;
  reason: string;
  replacement: string;
  status: 'Requested' | 'Approved' | 'Shipped' | 'Installed' | 'Closed';
  opened: string;
  vendorRef: string;
  migrate: boolean;
  site: string;
}
export const SPARES: { model: string; type: DType; site: string; qty: number }[] = [
  { model: 'AP4060', type: 'Access Point', site: 'HQ', qty: 6 },
  { model: 'AP5020', type: 'Access Point', site: 'Branch', qty: 3 },
  { model: 'S3528', type: 'Switch', site: 'HQ', qty: 2 },
  { model: 'S4220', type: 'Switch', site: 'Branch', qty: 1 },
  { model: 'MS-C536', type: 'Camera', site: 'Warehouse', qty: 4 },
  { model: 'MS-C296', type: 'Camera', site: 'HQ', qty: 5 },
  { model: 'EM300-TH', type: 'IoT Sensor', site: 'Factory', qty: 18 },
  { model: 'UG65', type: 'Gateway', site: 'HQ', qty: 2 },
  { model: 'RDR-200', type: 'Other', site: 'Office', qty: 7 },
];
export const RMA_REASONS = ['Hardware failure', 'Physical damage', 'Recurring reboots', 'Power / PoE fault', 'End of life', 'Lens / sensor fault', 'Lightning surge'];

/* ---------- Store ---------- */
@Injectable({ providedIn: 'root' })
export class DeviceStore {
  private readonly app = inject(AppState);
  readonly devices = signal<Device[]>(DEVICES_SEED.map((d) => ({ ...d })));
  readonly alerts = signal<DAlert[]>(seedAlerts(DEVICES_SEED));
  readonly gateways = signal<EdgeGw[]>(seedGateways(DEVICES_SEED));
  readonly profiles = signal<ConfigProfile[]>(PROFILES.map((p) => ({ ...p })));
  readonly campaigns = signal<Campaign[]>([
    { id: 'FW-2026-31', name: 'AP 10.4.2 security patch', type: 'Access Point', from: '10.4.1', to: '10.4.2', total: 412, stage: 1, done: 74, failed: 2, paused: false, started: '13 Oct 2026', window: '22:00 – 05:00', owner: 'Network Team' },
    { id: 'FW-2026-30', name: 'Switch 8.6.1 PoE fixes', type: 'Switch', from: '8.6.0', to: '8.6.1', total: 268, stage: 2, done: 141, failed: 1, paused: false, started: '08 Oct 2026', window: '23:00 – 04:00', owner: 'Network Team' },
    { id: 'FW-2026-29', name: 'Camera 5.2.0 codec upgrade', type: 'Camera', from: '5.1.4', to: '5.2.0', total: 198, stage: 0, done: 6, failed: 0, paused: true, started: '12 Oct 2026', window: '02:00 – 05:00', owner: 'Security Ops' },
    { id: 'FW-2026-27', name: 'Gateway edge runtime 3.2', type: 'Gateway', from: '60.0.0.42', to: '60.0.0.44', total: 96, stage: 4, done: 96, failed: 0, paused: false, started: '20 Sep 2026', window: '01:00 – 04:00', owner: 'OT Engineering' },
  ]);
  readonly rmas = signal<Rma[]>([
    { id: 'RMA-1042', deviceId: 'D4', device: 'TEMP-01', type: 'IoT Sensor', model: 'EM300-TH', reason: 'Recurring reboots', replacement: 'EM300-TH (spare)', status: 'Approved', opened: '13 Oct 2026', vendorRef: 'MS-88213', migrate: true, site: 'Factory' },
    { id: 'RMA-1041', deviceId: 'D30', device: 'CAM-27', type: 'Camera', model: 'MS-C536', reason: 'Lens / sensor fault', replacement: 'MS-C536 (spare)', status: 'Shipped', opened: '09 Oct 2026', vendorRef: 'MS-88102', migrate: true, site: 'Warehouse' },
    { id: 'RMA-1039', deviceId: 'D44', device: 'AP-650-31', type: 'Access Point', model: 'AP650', reason: 'Power / PoE fault', replacement: 'AP4060 (upgrade)', status: 'Installed', opened: '02 Oct 2026', vendorRef: 'EX-55190', migrate: true, site: 'HQ' },
    { id: 'RMA-1036', deviceId: 'D61', device: 'SW-5520-22', type: 'Switch', model: 'S5520', reason: 'Hardware failure', replacement: 'S5520 (advance)', status: 'Closed', opened: '21 Sep 2026', vendorRef: 'EX-54871', migrate: true, site: 'Branch' },
    { id: 'RMA-1034', deviceId: 'D77', device: 'GW-05', type: 'Gateway', model: 'UG65', reason: 'Lightning surge', replacement: 'UG67 (upgrade)', status: 'Closed', opened: '14 Sep 2026', vendorRef: 'MS-87001', migrate: false, site: 'Parking' },
  ]);
  readonly spares = signal(SPARES.map((s) => ({ ...s })));
  readonly toast = signal<string | null>(null);
  /** Shared selection so a "View details" on one page opens the device elsewhere. */
  readonly focusId = signal<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  readonly counts = computed(() => {
    const c = { total: 0, Online: 0, Offline: 0, Maintenance: 0, Inactive: 0 };
    for (const d of this.devices()) { c.total++; c[d.status]++; }
    return c;
  });
  readonly byType = computed(() => TYPES.map((t) => ({ type: t, n: this.devices().filter((d) => d.type === t).length })));
  readonly openCritical = computed(() => this.alerts().filter((a) => a.sev === 'Critical' && a.state !== 'Resolved').length);
  readonly outdated = computed(() => this.devices().filter((d) => d.status !== 'Inactive' && d.firmware !== TYPE_META[d.type].latest).length);
  private readonly seedByTS = (() => {
    const m = new Map<string, number>();
    for (const d of DEVICES_SEED) m.set(d.type + '|' + d.status, (m.get(d.type + '|' + d.status) ?? 0) + 1);
    return m;
  })();
  /** Reference snapshot + live deltas since load, so the chart matches the image but reacts to actions. */
  readonly statusChart = computed(() => {
    const now = new Map<string, number>();
    for (const d of this.devices()) now.set(d.type + '|' + d.status, (now.get(d.type + '|' + d.status) ?? 0) + 1);
    const keys: [string, DType][] = [['AP', 'Access Point'], ['Switch', 'Switch'], ['Camera', 'Camera'], ['IoT Sensor', 'IoT Sensor'], ['Gateway', 'Gateway']];
    return keys.map(([label, t]) => {
      const base = STATUS_SNAPSHOT[label];
      const st: DStatus[] = ['Online', 'Offline', 'Maintenance'];
      return { label, type: t, v: st.map((s, i) => Math.max(0, base[i] + (now.get(t + '|' + s) ?? 0) - (this.seedByTS.get(t + '|' + s) ?? 0))) };
    });
  });

  constructor() {
    // Live: firmware rollouts advance and gateway metrics breathe on each AppState tick.
    effect(() => {
      const t = this.app.tick();
      if (!t) return;
      untracked(() => {
        this.campaigns.update((l) => l.map((c) => {
          if (c.paused || c.stage >= 4) return c;
          const cap = Math.round((STAGES[c.stage].pct / 100) * c.total);
          const done = Math.min(cap, c.done + 1 + (t % 3));
          const failed = c.failed + (t % 17 === 0 ? 1 : 0);
          return { ...c, done, failed, stage: done >= cap && c.stage === 3 ? 4 : c.stage };
        }));
        this.gateways.update((l) => l.map((g, i) => g.status !== 'Online' ? g : { ...g, cpu: Math.max(8, Math.min(95, g.cpu + Math.round(Math.sin(t + i) * 4))), throughput: Math.max(1, g.throughput + Math.round(Math.cos(t / 2 + i) * 3)) }));
      });
    });
  }

  toastMsg(m: string) {
    this.toast.set(m);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 2600);
  }
  byId(id: string | null) {
    return this.devices().find((d) => d.id === id) ?? null;
  }
  patch(id: string, ch: Partial<Device>) {
    this.devices.update((l) => l.map((d) => (d.id === id ? { ...d, ...ch } : d)));
  }
  setStatus(ids: string[], status: DStatus) {
    this.devices.update((l) => l.map((d) => (ids.includes(d.id) ? { ...d, status, seenAgo: status === 'Online' ? 0 : d.seenAgo, health: status === 'Online' ? Math.max(d.health, 86) : d.health } : d)));
  }
  reboot(d: Device) {
    this.patch(d.id, { status: 'Maintenance' });
    this.toastMsg(`Reboot command sent to ${d.name} · back online in ~10 s`);
    setTimeout(() => {
      this.patch(d.id, { status: 'Online', seenAgo: 0, uptimeH: 0, cpu: 18, mem: 40, health: Math.max(d.health, 90) });
      this.alerts.update((l) => l.map((a) => (a.deviceId === d.id && a.state !== 'Resolved' && a.category === 'Connectivity' ? { ...a, state: 'Resolved' } : a)));
    }, 6000);
  }
  updateFirmware(ids: string[]) {
    const list = this.devices().filter((d) => ids.includes(d.id));
    this.devices.update((l) => l.map((d) => (ids.includes(d.id) ? { ...d, firmware: TYPE_META[d.type].latest, fwUpdated: '14 Oct 2026' } : d)));
    this.toastMsg(list.length === 1 ? `${list[0].name} updated to firmware ${TYPE_META[list[0].type].latest}` : `Firmware update queued for ${list.length} devices`);
  }
  addDevice(d: Device) {
    this.devices.update((l) => [d, ...l]);
  }
  raiseAlert(d: Device, title: string, sev: Sev, category: DAlert['category']) {
    const n = 9421 + this.alerts().length;
    this.alerts.update((l) => [{ id: `ALT-${n}`, deviceId: d.id, device: d.name, type: d.type, site: d.site, title, sev, ago: 0, state: 'Open', assignee: 'Unassigned', category }, ...l]);
  }
  createTicket(d: Device, note = '') {
    const id = `INC-${48210 + Math.floor(Math.random() * 900)}`;
    this.toastMsg(`Ticket ${id} created in ServiceNow for ${d.name}${note ? ' · ' + note : ''}`);
    return id;
  }
}
