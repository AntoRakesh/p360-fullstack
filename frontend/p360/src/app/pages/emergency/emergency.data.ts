// Hard-coded Emergency & Mustering data + a root store shared by all emergency pages.
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { rng } from '../dashboards/demo-data';
import { MapZone } from '../rtls/floor-plan';

export type EStatus = 'Evacuated' | 'Yet to Evacuate' | 'Missing';
export interface EPerson {
  id: string;
  name: string;
  initials: string;
  color: string;
  dept: string;
  type: 'Employee' | 'Contractor' | 'Visitor';
  floor: string;
  zone: string;
  status: EStatus;
  muster: string;
  lastSeen: number;
  phone: string;
  note?: string;
}
export interface Muster {
  id: string;
  name: string;
  location: string;
  expected: number;
  present: number;
  warden: string;
  capacity: number;
  lat: string;
}
export interface Evacuation {
  id: string;
  type: string;
  location: string;
  triggeredAt: number;
  by: string;
  scope: string;
  drill: boolean;
  endedAt?: number;
}
export interface EEvent {
  at: number;
  event: string;
  location: string;
  source: string;
  icon: string;
  color: string;
}

/** Department roll-call from the reference image (+ contractors & visitors so totals reach 842 / 792 / 38 / 12). */
export const DEPT_SEED: [string, number, number, number, number][] = [
  ['Administration', 120, 118, 1, 1],
  ['IT', 180, 172, 6, 2],
  ['Finance', 96, 94, 1, 1],
  ['Operations', 220, 198, 16, 6],
  ['HR', 80, 78, 1, 1],
  ['Facilities', 60, 57, 3, 0],
  ['Contractors & Visitors', 86, 75, 10, 1],
];
export const MUSTER_SEED: Muster[] = [
  { id: 'A', name: 'Muster Point A', location: 'Main Parking', expected: 320, present: 318, warden: 'Tom Baker', capacity: 400, lat: 'North-east car park' },
  { id: 'B', name: 'Muster Point B', location: 'East Lawn', expected: 210, present: 198, warden: 'Grace Park', capacity: 260, lat: 'Lawn beside Block C' },
  { id: 'C', name: 'Muster Point C', location: 'South Gate', expected: 156, present: 156, warden: 'Ravi Shankar', capacity: 200, lat: 'Gate 3 forecourt' },
  { id: 'D', name: 'Muster Point D', location: 'Sports Area', expected: 96, present: 82, warden: 'Omar Khalid', capacity: 150, lat: 'Five-a-side pitch' },
  { id: 'E', name: 'Muster Point E', location: 'West Gate', expected: 60, present: 38, warden: 'Aisha Bello', capacity: 90, lat: 'Gate 1 visitor bay' },
  { id: 'F', name: 'Muster Point F', location: 'North Gate', expected: 48, present: 48, warden: 'Kenji Sato', capacity: 80, lat: 'Gate 2 security post' },
];
export const musterStatus = (m: Muster) => (m.present >= m.expected * 0.99 ? 'Complete' : m.present >= m.expected * 0.75 ? 'In Progress' : 'Incomplete');

const FIRST = ['Arjun', 'Priya', 'Ahmed', 'Maria', 'Chen', 'Li', 'Fatima', 'Omar', 'Grace', 'Sara', 'Daniel', 'Nadia', 'Rahul', 'Vikram', 'Aisha', 'Kenji', 'Layla', 'Tom', 'Hannah', 'Yusuf', 'Meera', 'Lucas', 'Zara', 'Noah', 'Sofia', 'Ibrahim', 'Chloe', 'Ravi', 'Emma', 'Ali'];
const LAST = ['Mehta', 'Sharma', 'Hassan', 'Santos', 'Wei', 'Ali', 'Khalid', 'Park', 'Khan', 'Kim', 'Hussein', 'Verma', 'Rao', 'Bello', 'Sato', 'Haddad', 'Baker', 'Lee', 'Rahman', 'Iyer', 'Silva', 'Brown', 'Rossi', 'Musa', 'Martin', 'Nair'];
const FLOORS = ['Ground Floor', 'Floor 1', 'Floor 2', 'Floor 3', 'Floor 4', 'Floor 5'];
const ZONES_BY_FLOOR: Record<string, string[]> = {
  'Ground Floor': ['Lobby', 'Loading Bay', 'Security Desk', 'Mail Room'],
  'Floor 1': ['Conference Room', 'West Wing', 'North Wing', 'Cafeteria', 'Open Office'],
  'Floor 2': ['Finance Office', 'Training Room', 'Staircase', 'Open Office 2'],
  'Floor 3': ['Board Room', 'Design Studio', 'Open Office 3'],
  'Floor 4': ['Exec Suite', 'Open Office 4'],
  'Floor 5': ['Innovation Lab', 'Hot Desks'],
};
const PAL = ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0d9488)', 'var(--ka-ca8a04)', 'var(--ka-db2777)', 'var(--ka-16a34a)', 'var(--ka-ea580c)', 'var(--ka-475569)'];

export const E_PEOPLE: EPerson[] = (() => {
  const r = rng(842);
  const out: EPerson[] = [];
  const musterBag: string[] = [];
  MUSTER_SEED.forEach((m) => {
    for (let i = 0; i < Math.round((m.present / 840) * 792); i++) musterBag.push(m.id);
  });
  while (musterBag.length < 792) musterBag.push('A');
  let mi = 0;
  for (const [dept, total, evac, pending] of DEPT_SEED) {
    for (let k = 0; k < total; k++) {
      const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
      const status: EStatus = k < evac ? 'Evacuated' : k < evac + pending ? 'Yet to Evacuate' : 'Missing';
      const floor = status === 'Evacuated' ? FLOORS[Math.floor(r() * FLOORS.length)] : status === 'Missing' ? ['Floor 1', 'Floor 1', 'Floor 2', 'Ground Floor'][k % 4] : r() < 0.6 ? 'Floor 1' : 'Floor 2';
      const zs = ZONES_BY_FLOOR[floor];
      const type: EPerson['type'] = dept === 'Contractors & Visitors' ? (k % 3 ? 'Contractor' : 'Visitor') : 'Employee';
      out.push({
        id: `${type === 'Employee' ? 'EMP' : type === 'Contractor' ? 'CON' : 'VIS'}-${String(1000 + out.length).padStart(5, '0')}`,
        name, initials: name.split(' ').map((x) => x[0]).join(''), color: PAL[out.length % PAL.length], dept, type, floor, zone: zs[Math.floor(r() * zs.length)],
        status, muster: status === 'Evacuated' ? musterBag[mi++ % musterBag.length] : '', lastSeen: status === 'Missing' ? 4 + Math.floor(r() * 9) : status === 'Evacuated' ? Math.floor(r() * 5) : 0,
        phone: `+971 50 ${400 + (out.length % 500)} ${2000 + out.length * 3}`,
      });
    }
  }
  return out;
})();

/* ---------- Site map (Floor 1, building + outside muster area) ---------- */
export const E_BUILDING = { x: 20, y: 20, w: 700, h: 520 };
export const E_ZONES: MapZone[] = [
  { id: 'nw', name: 'North Wing', x: 300, y: 50, w: 200, h: 120, color: 'var(--ka-3b82f6)' },
  { id: 'conf', name: 'Conference Room', x: 120, y: 180, w: 200, h: 130, color: 'var(--ka-ef4444)', fill: 0.3 },
  { id: 'ww', name: 'West Wing', x: 40, y: 320, w: 230, h: 200, color: 'var(--ka-3b82f6)' },
  { id: 'caf', name: 'Cafeteria', x: 430, y: 200, w: 230, h: 200, color: 'var(--ka-f59e0b)' },
  { id: 'off', name: 'Open Office', x: 280, y: 330, w: 140, h: 190, color: 'var(--ka-94a3b8)', kind: 'open', fill: 0.05 },
  { id: 'srv', name: 'Store', x: 540, y: 50, w: 130, h: 120, color: 'var(--ka-94a3b8)', kind: 'open', fill: 0.05 },
  { id: 'lob', name: 'Lobby', x: 440, y: 420, w: 200, h: 100, color: 'var(--ka-8b5cf6)' },
];
export const EXITS = [
  { id: 'ex1', name: 'Main Exit', x: 400, y: 540 },
  { id: 'ex2', name: 'East Exit 1', x: 720, y: 160 },
  { id: 'ex3', name: 'East Exit 2', x: 720, y: 420 },
  { id: 'ex4', name: 'North Exit', x: 520, y: 20 },
];
export const ROUTES: [number, number][][] = [
  [[220, 250], [220, 300], [330, 300], [330, 400], [400, 470], [400, 530]],
  [[400, 120], [520, 120], [700, 140], [712, 160]],
  [[540, 300], [700, 300], [712, 420]],
  [[730, 160], [800, 200], [830, 260]],
  [[730, 420], [800, 380], [830, 300]],
  [[400, 550], [400, 600], [810, 560], [840, 320]],
];
export const MUSTER_XY: [number, number] = [840, 280];
const hash = (s: string) => [...s].reduce((x, c) => (x * 31 + c.charCodeAt(0)) | 0, 7);
const ZONE_BY_NAME: Record<string, string> = { 'Conference Room': 'conf', 'West Wing': 'ww', 'North Wing': 'nw', Cafeteria: 'caf', 'Open Office': 'off' };
/** Map position of a Floor 1 person who has not reached a muster point. */
export function mapXY(p: EPerson): [number, number] {
  const h = Math.abs(hash(p.id));
  const z = E_ZONES.find((x) => x.id === (ZONE_BY_NAME[p.zone] ?? ['conf', 'ww', 'nw', 'caf', 'off'][h % 5]))!;
  return [z.x + 20 + (h % (z.w - 40)), z.y + 20 + ((h >> 5) % (z.h - 50))];
}

export const fmtClock = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const fmtTimer = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((x) => String(x).padStart(2, '0')).join(':');
};

@Injectable({ providedIn: 'root' })
export class EmergencyStore {
  private readonly app = inject(AppState);
  readonly people = signal<EPerson[]>(E_PEOPLE.map((p) => ({ ...p })));
  readonly musters = signal<Muster[]>(MUSTER_SEED.map((m) => ({ ...m })));
  readonly evac = signal<Evacuation | null>(null);
  readonly history = signal<Evacuation[]>([]);
  readonly events = signal<EEvent[]>([]);
  readonly sent = signal<{ at: number; title: string; channels: string[]; audience: string; text: string; delivered: number }[]>([]);
  readonly drillMode = signal(false);
  /** Seconds, updated every second, for live timers. */
  readonly now = signal(Date.now());

  readonly counts = computed(() => {
    const l = this.people();
    const c = { total: l.length, evac: 0, yet: 0, missing: 0 };
    for (const p of l) p.status === 'Evacuated' ? c.evac++ : p.status === 'Missing' ? c.missing++ : c.yet++;
    return c;
  });

  constructor() {
    const t0 = Date.now() - 384000;
    this.evac.set({ id: 'EVC-2026-014', type: 'Fire Alarm', location: 'Head Office – Floor 1 (Conference Room)', triggeredAt: t0, by: 'Fire Panel (Auto)', scope: 'Full Building Evacuation', drill: false });
    const ev = (s: number, event: string, location: string, source: string, icon: string, color: string): EEvent => ({ at: t0 + s * 1000, event, location, source, icon, color });
    this.events.set([
      ev(372, 'Person reached muster point', 'Muster Point A', 'RTLS', 'shield-check', 'var(--ka-22c55e)'),
      ev(345, 'Evacuation route cleared', 'North Wing', 'System', 'megaphone', 'var(--ka-3b82f6)'),
      ev(258, 'Person marked missing', 'Floor 1', 'Manual', 'triangle-alert', 'var(--ka-ef4444)'),
      ev(210, 'Zone evacuation complete', 'Floor 2', 'System', 'run', 'var(--ka-22c55e)'),
      ev(125, 'Fire alarm triggered', 'Conference Room', 'Fire Panel', 'flame', 'var(--ka-ef4444)'),
      ev(102, 'Emergency notification sent', 'All Floors', 'System', 'megaphone', 'var(--ka-ef4444)'),
      ev(0, 'Evacuation started', 'Head Office', 'Fire Panel', 'siren', 'var(--ka-ef4444)'),
    ]);
    this.history.set([
      { id: 'EVC-2026-013', type: 'Fire Drill', location: 'Head Office – All Floors', triggeredAt: Date.now() - 22 * 86400000, by: 'HSE Manager', scope: 'Full Building Evacuation', drill: true, endedAt: Date.now() - 22 * 86400000 + 11 * 60000 },
      { id: 'EVC-2026-012', type: 'Gas Leak', location: 'Manufacturing – Plant 2', triggeredAt: Date.now() - 49 * 86400000, by: 'Gas Detector (Auto)', scope: 'Zone Evacuation', drill: false, endedAt: Date.now() - 49 * 86400000 + 26 * 60000 },
      { id: 'EVC-2026-011', type: 'Fire Drill', location: 'Warehouse', triggeredAt: Date.now() - 80 * 86400000, by: 'HSE Manager', scope: 'Full Building Evacuation', drill: true, endedAt: Date.now() - 80 * 86400000 + 9 * 60000 },
      { id: 'EVC-2026-010', type: 'Bomb Threat', location: 'Head Office – Lobby', triggeredAt: Date.now() - 131 * 86400000, by: 'Security Control', scope: 'Full Building Evacuation', drill: false, endedAt: Date.now() - 131 * 86400000 + 48 * 60000 },
    ]);
    setInterval(() => this.now.set(Date.now()), 1000);
    // Live progress: one more person reaches a muster point every ~10 s (big batches early in a fresh evacuation).
    effect(() => {
      const t = this.app.tick();
      untracked(() => {
        const e = this.evac();
        if (!t || !e || e.endedAt) return;
        const yet = this.counts().yet;
        if (yet > 60) this.evacuate(Math.round(yet * 0.18));
        else if (t % 4 === 0 && yet > 4) this.evacuate(1);
      });
    });
  }

  private evacuate(n: number) {
    const ids = this.people().filter((p) => p.status === 'Yet to Evacuate').slice(0, n).map((p) => p.id);
    this.markSafe(ids, 'RTLS');
  }
  markSafe(ids: string[], source = 'Manual') {
    if (!ids.length) return;
    const set = new Set(ids);
    const per = new Map<string, number>();
    const order = ['A', 'B', 'D', 'E', 'C', 'F'];
    this.people.update((l) =>
      l.map((p, i) => {
        if (!set.has(p.id) || p.status === 'Evacuated') return p;
        const m = p.muster || this.lowest() || order[i % 6];
        per.set(m, (per.get(m) ?? 0) + 1);
        return { ...p, status: 'Evacuated', muster: m, lastSeen: 0 };
      }),
    );
    this.musters.update((l) => l.map((m) => ({ ...m, present: m.present + (per.get(m.id) ?? 0) })));
    const first = this.people().find((p) => set.has(p.id))!;
    this.log(ids.length === 1 ? `${first.name} reached muster point` : `${ids.length} people reached muster points`, `Muster Point ${first.muster}`, source, 'shield-check', 'var(--ka-22c55e)');
  }
  private lowest() {
    return [...this.musters()].sort((a, b) => a.present / a.expected - b.present / b.expected)[0]?.id;
  }
  markMissing(id: string) {
    this.people.update((l) => l.map((p) => (p.id === id ? { ...p, status: 'Missing', muster: '', lastSeen: 1 } : p)));
    const p = this.people().find((x) => x.id === id)!;
    this.log(`${p.name} marked missing`, `${p.floor} · ${p.zone}`, 'Manual', 'triangle-alert', 'var(--ka-ef4444)');
  }
  log(event: string, location: string, source: string, icon: string, color: string) {
    this.events.update((l) => [{ at: Date.now(), event, location, source, icon, color }, ...l]);
  }
  trigger(e: Omit<Evacuation, 'id' | 'triggeredAt'>) {
    const cur = this.evac();
    if (cur && !cur.endedAt) this.history.update((h) => [{ ...cur, endedAt: Date.now() }, ...h]);
    this.evac.set({ ...e, id: `EVC-2026-${String(15 + this.history().length).padStart(3, '0')}`, triggeredAt: Date.now() });
    this.people.update((l) => l.map((p) => ({ ...p, status: 'Yet to Evacuate', muster: '', lastSeen: 0 })));
    this.musters.update((l) => l.map((m) => ({ ...m, present: 0 })));
    this.events.set([]);
    this.log(e.drill ? 'Evacuation drill started' : 'Evacuation started', e.location, e.by, 'siren', 'var(--ka-ef4444)');
    this.log('Emergency notification sent', 'All Floors', 'System', 'megaphone', 'var(--ka-ef4444)');
  }
  allClear() {
    const cur = this.evac();
    if (!cur || cur.endedAt) return;
    const ended = { ...cur, endedAt: Date.now() };
    this.evac.set(ended);
    this.history.update((h) => [ended, ...h]);
    this.log('All clear — re-entry permitted', cur.location, 'Demo login', 'shield-check', 'var(--ka-22c55e)');
  }
  broadcast(title: string, text: string, channels: string[], audience: string) {
    const delivered = audience === 'Yet to evacuate & missing' ? this.counts().yet + this.counts().missing : this.counts().total;
    this.sent.update((l) => [{ at: Date.now(), title, text, channels, audience, delivered }, ...l]);
    this.log(`Broadcast: ${title}`, audience, channels.join(', '), 'megaphone', 'var(--ka-7c3aed)');
  }
}
