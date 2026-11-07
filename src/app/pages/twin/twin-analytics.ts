// Deterministic analytics models shared by the Heatmaps, Path, Scenario and Reports pages.
import { FLOORS, HOURLY, M_PER_UNIT, rng, TEntity, TZone, ZoneType } from './twin.data';

export type HeatMetric = 'Occupancy' | 'Dwell Time' | 'Temperature' | 'CO₂';
export const HEAT_METRICS: HeatMetric[] = ['Occupancy', 'Dwell Time', 'Temperature', 'CO₂'];
export const METRIC_UNIT: Record<HeatMetric, string> = { Occupancy: '%', 'Dwell Time': ' min', Temperature: '°C', 'CO₂': ' ppm' };
export const METRIC_RANGE: Record<HeatMetric, [number, number]> = { Occupancy: [0, 100], 'Dwell Time': [0, 180], Temperature: [19, 33], 'CO₂': [400, 1100] };
export const METRIC_THRESHOLD: Record<HeatMetric, number> = { Occupancy: 85, 'Dwell Time': 120, Temperature: 26, 'CO₂': 900 };
export const FLOOR_TABS = FLOORS.filter((f) => f.id !== 'R').map((f) => ({ id: f.id, name: f.id === 'G' ? 'Ground' : `Floor ${f.id}` }));
export const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_FACTOR = [1, 1.04, 1.06, 1.02, 0.86, 0.18, 0.12];
export const PERIOD_FACTOR: Record<string, number> = { Today: 1, '7-Day Avg': 0.84, '30-Day Avg': 0.79 };

const DWELL: Partial<Record<ZoneType, number>> = { workstations: 165, meeting: 52, cafeteria: 34, collab: 41, pods: 78, reception: 11, lobby: 7, storage: 16, server: 24, wellness: 47, security: 120 };

export const center = (z: { x: number; y: number; w: number; h: number }): [number, number] => [z.x + z.w / 2, z.y + z.h / 2];
const hash = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Share of peak at hour h for a zone type (current hour 10 ≈ 1). */
export function profile(type: ZoneType, h: number) {
  const base = HOURLY[h] / 92;
  if (type === 'cafeteria') return base * (h === 12 || h === 13 ? 1.42 : h === 8 ? 0.9 : h >= 14 && h <= 16 ? 0.55 : h === 10 ? 1 : 0.7);
  if (type === 'reception' || type === 'lobby') return base * (h === 8 || h === 9 || h === 17 || h === 18 ? 1.5 : 0.8);
  if (type === 'meeting') return base * (h === 12 ? 0.6 : h >= 14 && h <= 16 ? 1.12 : 1);
  return base;
}
/** Zone utilisation (0..~1.3) at hour h. */
export function zoneUtil(z: TZone, h: number, factor = 1) {
  if (!z.capacity) return 0;
  const wobble = 1 + Math.sin(h * 1.3 + hash(z.id)) * 0.06;
  return clamp((z.occupancy / z.capacity) * profile(z.type, h) * wobble * factor, 0, 1.3);
}
export function zoneMetric(z: TZone, m: HeatMetric, h: number, factor = 1): number {
  const u = zoneUtil(z, h, factor);
  if (m === 'Occupancy') return Math.round(u * 100);
  if (m === 'Dwell Time') return Math.round((DWELL[z.type] ?? 20) * (0.55 + 0.45 * Math.min(1, HOURLY[h] / 92)) * (u ? 1 : 0.2));
  if (m === 'Temperature') return +(21.2 + u * 3.6 + (z.type === 'server' ? (z.floor === '4' ? 7.2 : 2.4) : 0) + (h > 12 && h < 17 ? 0.5 : 0)).toFixed(1);
  return Math.round(420 + u * 620 + (z.type === 'meeting' ? 60 : 0));
}
export function metricK(m: HeatMetric, v: number) {
  const [a, b] = METRIC_RANGE[m];
  return clamp((v - a) / (b - a), 0, 1);
}
export const fmtMetric = (m: HeatMetric, v: number) => `${v}${METRIC_UNIT[m]}`;
/** Heatmapped zones: anything with people or (for temperature) the server room. */
export const heatZones = (zs: TZone[]) => zs.filter((z) => z.capacity > 0 && z.type !== 'core');

/* ---------------- movement ---------------- */
export interface Journey {
  id: string;
  who: string;
  whoId: string;
  kind: TEntity['kind'];
  floor: string;
  stops: { zone: string; at: string; dwell: number }[];
  points: [number, number][];
  distance: number;
  duration: number;
  start: number;
}
/** L-shaped corridor route between two zone centres. */
export function route(a: [number, number], b: [number, number]): [number, number][] {
  const cy = Math.round((a[1] + b[1]) / 2);
  return [a, [a[0], cy], [b[0], cy], b];
}
export function pathLen(pts: [number, number][]) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return d * M_PER_UNIT;
}
/** Point at fraction t (0..1) along a polyline. */
export function along(pts: [number, number][], t: number): [number, number] {
  const total = pathLen(pts) / M_PER_UNIT;
  let rem = clamp(t, 0, 1) * total;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (rem <= seg) {
      const k = seg ? rem / seg : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
    }
    rem -= seg;
  }
  return pts[pts.length - 1];
}
const hhmm = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** ~3 journeys per person on the floor (deterministic). */
export function buildJourneys(floor: string, zones: TZone[], people: TEntity[], john: [number, number][]): Journey[] {
  const zs = zones.filter((z) => z.floor === floor && z.capacity > 0 && !z.restricted);
  if (zs.length < 2) return [];
  const r = rng(floor.charCodeAt(0) * 131 + zs.length);
  const ppl = people.filter((p) => p.floor === floor);
  const out: Journey[] = [];
  const weight = (z: TZone) => (z.type === 'cafeteria' ? 3 : z.type === 'meeting' ? 2.4 : z.type === 'reception' || z.type === 'lobby' ? 2 : z.type === 'collab' ? 1.6 : 1);
  const pick = () => {
    const tot = zs.reduce((a, z) => a + weight(z), 0);
    let x = r() * tot;
    for (const z of zs) if ((x -= weight(z)) <= 0) return z;
    return zs[0];
  };
  ppl.forEach((p, pi) => {
    const n = 2 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) {
      const isJohn = p.id === 'P-1001' && j === 0 && floor === '4';
      const hops = 1 + Math.floor(r() * 3);
      const seq: TZone[] = [];
      let cur = zs.find((z) => z.name === p.zone) ?? pick();
      if (r() < 0.25) cur = zs.find((z) => z.type === 'reception' || z.type === 'lobby') ?? cur;
      seq.push(cur);
      for (let k = 0; k < hops; k++) {
        let nx = pick();
        if (nx.id === cur.id) nx = zs[(zs.indexOf(nx) + 1) % zs.length];
        seq.push(nx);
        cur = nx;
      }
      let pts: [number, number][] = [];
      seq.forEach((z, i) => {
        const c: [number, number] = [Math.round(z.x + z.w * (0.3 + r() * 0.4)), Math.round(z.y + z.h * (0.3 + r() * 0.4))];
        if (i === 0) pts.push(c);
        else pts.push(...route(pts[pts.length - 1], c).slice(1));
      });
      let names = seq.map((z) => z.name);
      if (isJohn) {
        pts = john;
        names = ['Reception', 'Collaboration Area', 'Open Workstations North'];
      }
      const start = isJohn ? 10 * 60 + 14 : Math.round(7.5 * 60 + r() * 10 * 60);
      const distance = Math.round(pathLen(pts));
      let t = start;
      const stops = names.map((zone, i) => {
        const dwell = i === names.length - 1 ? Math.round(20 + r() * 90) : Math.round(2 + r() * 18);
        const s = { zone, at: hhmm(t), dwell };
        t += dwell + Math.round(((distance / names.length) / 1.2) / 60 + 1);
        return s;
      });
      out.push({ id: isJohn ? 'J-41001' : `J-${floor}${String(pi * 5 + j + 1).padStart(4, '0')}`, who: p.name, whoId: p.id, kind: p.kind, floor, stops, points: pts, distance, duration: Math.max(1, Math.round(distance / 1.2 / 60 + stops.slice(0, -1).reduce((a, s) => a + s.dwell, 0))), start });
    }
  });
  return out.sort((a, b) => a.start - b.start);
}
