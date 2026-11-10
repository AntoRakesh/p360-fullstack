// Pure geometry for the 2.5D (isometric-style) building renderer: furnishes zones with solids and projects them.
import { rng, TZone } from './twin.data';

export type Pt = [number, number];
/** Extruded polygon (prism) or flat floor patch (h = 0). */
export interface Solid {
  pts: Pt[];
  z0: number;
  h: number;
  top: string;
  side: string;
  op?: number;
  stroke?: string;
  /** Flat solids are drawn in the floor pass (below everything). */
  flat?: boolean;
  /** Plant canopy / sphere-ish blob instead of prism. */
  ball?: { r: number };
  person?: string;
  ref?: string;
}
export interface View {
  rot: number;
  elev: number;
  k: number;
  panX: number;
  panY: number;
  cx: number;
  cy: number;
  ox: number;
  oy: number;
}
export interface Drawn {
  t: 'poly' | 'ball' | 'person';
  d?: string;
  fill: string;
  op?: number;
  stroke?: string;
  sw?: number;
  x?: number;
  y?: number;
  r?: number;
  ry?: number;
  s?: number;
  ref?: string;
}

const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const box = (x: number, y: number, w: number, h: number, z0: number, hh: number, top: string, side: string, extra: Partial<Solid> = {}): Solid => ({ pts: rect(x, y, w, h), z0, h: hh, top, side, ...extra });

/** Splits a long thin rectangle into chunks so painter sorting stays correct. */
function wall(x: number, y: number, w: number, h: number, hh: number, top: string, side: string, op = 1, max = 70): Solid[] {
  const out: Solid[] = [];
  if (w >= h) {
    const n = Math.max(1, Math.ceil(w / max));
    for (let i = 0; i < n; i++) out.push(box(x + (w / n) * i, y, w / n, h, 0, hh, top, side, { op }));
  } else {
    const n = Math.max(1, Math.ceil(h / max));
    for (let i = 0; i < n; i++) out.push(box(x, y + (h / n) * i, w, h / n, 0, hh, top, side, { op }));
  }
  return out;
}

const FLOOR_FILL: Record<string, string> = {
  workstations: 'var(--ka-e7e9ee)', meeting: 'var(--ka-e6d6bb)', cafeteria: 'var(--ka-ead9bd)', collab: 'var(--ka-e3ece6)', server: 'var(--ka-c8ced9)', storage: 'var(--ka-dde1e7)', reception: 'var(--ka-f0ebe2)',
  core: 'var(--ka-d4d7de)', pods: 'var(--ka-e5e2f0)', lobby: 'var(--ka-efe9df)', hvac: 'var(--ka-cfd3da)', solar: 'var(--ka-d6dae1)', security: 'var(--ka-dfe3ea)', wellness: 'var(--ka-dfeaf0)',
};
const WOOD = 'var(--ka-c9a678)';
const WOOD_S = 'var(--ka-a9875c)';
const DESK = 'var(--ka-fbfbfc)';
const DESK_S = 'var(--ka-c9ced8)';
const CHAIR = 'var(--ka-3a3f4f)';
const SCREEN = 'var(--ka-1f2433)';
const PLANT = 'var(--ka-4f9d4f)';
const POT = 'var(--ka-e8e2d6)';
const WALL = 'var(--ka-f4f5f8)';
const WALL_S = 'var(--ka-d7dbe4)';
const GLASS = 'var(--ka-bcd8ee)';
const GLASS_S = 'var(--ka-9cc3e3)';

function plant(x: number, y: number, r = 9): Solid[] {
  return [box(x - 4, y - 4, 8, 8, 0, 8, POT, 'var(--ka-cfc6b5)'), { pts: [[x, y]], z0: 8 + r * 0.7, h: 0, top: PLANT, side: PLANT, ball: { r } }];
}
function chair(x: number, y: number, c = CHAIR): Solid {
  return box(x - 4, y - 4, 8, 8, 0, 7, c, 'var(--ka-1e222c)');
}
function deskRow(x: number, y: number, w: number, h: number, r: () => number, people: string[]): Solid[] {
  const out: Solid[] = [];
  const cols = Math.max(1, Math.floor((w - 20) / 46));
  const rows = Math.max(1, Math.floor((h - 20) / 58));
  const gx = (w - cols * 46) / 2 + x;
  const gy = (h - rows * 58) / 2 + y;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const dx = gx + i * 46 + 4;
      const dy = gy + j * 58 + 14;
      out.push(box(dx, dy, 38, 18, 0, 11, DESK, DESK_S));
      out.push(box(dx + 6, dy + 2, 12, 2.5, 11, 9, SCREEN, 'var(--ka-0b0e16)'));
      out.push(box(dx + 21, dy + 2, 12, 2.5, 11, 9, SCREEN, 'var(--ka-0b0e16)'));
      out.push(chair(dx + 12, dy + 26), chair(dx + 27, dy + 26));
      out.push(chair(dx + 12, dy - 8), chair(dx + 27, dy - 8));
      if (people.length && r() < 0.55) out.push({ pts: [[dx + 12 + (r() < 0.5 ? 15 : 0), dy + 25]], z0: 0, h: 0, top: '', side: '', person: people[Math.floor(r() * people.length)] });
    }
  }
  return out;
}

/** Furniture, walls and floor patches for one floor. */
export function furnish(zones: TZone[], seed: number, shirts: string[]): Solid[] {
  const r = rng(seed);
  const out: Solid[] = [];
  const isRoof = zones.some((z) => z.type === 'solar');
  for (const z of zones) {
    out.push({ pts: rect(z.x, z.y, z.w, z.h), z0: 0, h: 0, top: FLOOR_FILL[z.type] ?? 'var(--ka-e8eaee)', side: '', flat: true, ref: z.id, stroke: 'var(--ka-cfd3dc)' });
    const { x, y, w, h } = z;
    switch (z.type) {
      case 'workstations':
        out.push(...deskRow(x + 6, y + 6, w - 12, h - 12, r, shirts));
        out.push(...plant(x + w - 16, y + 14), ...plant(x + 14, y + h - 14, 8));
        break;
      case 'meeting': {
        // three glass rooms with tables
        const n = 3;
        const rw = w / n;
        for (let i = 0; i < n; i++) {
          const rx = x + i * rw;
          const th = Math.min(h - 80, 90);
          out.push(box(rx + rw / 2 - 18, y + 40, 36, th, 0, 10, WOOD, WOOD_S));
          for (let c = 0; c < 4; c++) {
            out.push(chair(rx + rw / 2 - 26, y + 52 + c * (th / 4)), chair(rx + rw / 2 + 26, y + 52 + c * (th / 4), 'var(--ka-55607a)'));
          }
          if (r() < 0.75) out.push({ pts: [[rx + rw / 2 - 26, y + 70]], z0: 0, h: 0, top: '', side: '', person: shirts[i % Math.max(1, shirts.length)] ?? 'var(--ka-2563eb)' });
          if (i) out.push(...wall(rx - 1.5, y, 3, h - 30, 30, 'var(--ka-dbe9f6)', GLASS_S, 0.55));
        }
        out.push(...wall(x, y + h - 32, w - 40, 3, 30, 'var(--ka-dbe9f6)', GLASS_S, 0.5));
        out.push(...plant(x + w - 18, y + h - 12, 8));
        break;
      }
      case 'cafeteria': {
        out.push(...wall(x + 12, y + 10, w - 24, 22, 14, 'var(--ka-f5f1ea)', 'var(--ka-c9bca7)', 1, 80));
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 2; j++) {
            const tx = x + 40 + i * ((w - 80) / 3);
            const ty = y + 75 + j * 60;
            out.push(box(tx - 12, ty - 12, 24, 24, 0, 10, 'var(--ka-ffffff)', 'var(--ka-cfd4dc)'));
            out.push(chair(tx - 20, ty, 'var(--ka-e0a95c)'), chair(tx + 20, ty, 'var(--ka-e0a95c)'), chair(tx, ty - 20, 'var(--ka-e0a95c)'), chair(tx, ty + 20, 'var(--ka-e0a95c)'));
            if (r() < 0.6) out.push({ pts: [[tx + 20, ty]], z0: 0, h: 0, top: '', side: '', person: shirts[Math.floor(r() * shirts.length)] ?? 'var(--ka-f59e0b)' });
          }
        out.push(...plant(x + w - 16, y + h - 16, 10), ...plant(x + 16, y + h - 16, 9));
        break;
      }
      case 'collab': {
        out.push({ pts: rect(x + 30, y + 30, w - 60, h - 60), z0: 0.5, h: 0, top: 'var(--ka-c7dccd)', side: '', flat: true });
        out.push(box(x + 40, y + 40, 70, 18, 0, 9, 'var(--ka-4f8f7b)', 'var(--ka-3c6f60)'), box(x + 40, y + 58, 18, 50, 0, 9, 'var(--ka-4f8f7b)', 'var(--ka-3c6f60)'));
        out.push(box(x + w - 110, y + h - 58, 70, 18, 0, 9, 'var(--ka-e08a3c)', 'var(--ka-b86d2c)'), box(x + w - 58, y + 52, 18, 50, 0, 9, 'var(--ka-e08a3c)', 'var(--ka-b86d2c)'));
        out.push(box(x + w / 2 - 22, y + h / 2 - 14, 44, 28, 0, 8, WOOD, WOOD_S));
        out.push(...plant(x + 14, y + 14, 11), ...plant(x + w - 14, y + 14, 10), ...plant(x + w / 2, y + h - 14, 9));
        for (let i = 0; i < 3; i++) out.push({ pts: [[x + 70 + i * 50, y + h / 2 + 24]], z0: 0, h: 0, top: '', side: '', person: shirts[(i * 3) % Math.max(1, shirts.length)] ?? 'var(--ka-16a34a)' });
        break;
      }
      case 'server': {
        out.push(...wall(x, y, w, 4, 32, WALL, WALL_S), ...wall(x, y, 4, h, 32, WALL, WALL_S), ...wall(x, y + h - 4, w - 50, 4, 32, 'var(--ka-e7ebf2)', GLASS_S, 0.6));
        for (let i = 0; i < 4; i++) {
          const rx = x + 30 + i * ((w - 60) / 3.4);
          out.push(...wall(rx, y + 26, 18, h - 60, 30, 'var(--ka-2a2f3d)', 'var(--ka-141824)', 1, 34));
        }
        break;
      }
      case 'storage': {
        out.push(...wall(x, y, 4, h, 30, WALL, WALL_S));
        for (let i = 0; i < 3; i++) {
          const sy = y + 20 + i * 36;
          out.push(...wall(x + 20, sy, w * 0.45, 14, 26, 'var(--ka-93a3b8)', 'var(--ka-6c7d93)', 1, 50));
          for (let b = 0; b < 4; b++) out.push(box(x + 26 + b * (w * 0.1), sy + 2, 18, 10, 26, 8, 'var(--ka-e3b778)', 'var(--ka-c08f4a)'));
        }
        out.push(box(x + w * 0.62, y + 24, 46, 40, 0, 14, 'var(--ka-e3b778)', 'var(--ka-c08f4a)'), box(x + w * 0.62 + 52, y + 24, 30, 30, 0, 20, 'var(--ka-e3b778)', 'var(--ka-c08f4a)'));
        break;
      }
      case 'reception': {
        out.push(box(x + w * 0.55, y + 30, 90, 22, 0, 13, 'var(--ka-ffffff)', 'var(--ka-c8ccd6)'), box(x + w * 0.55 + 68, y + 30, 22, 60, 0, 13, 'var(--ka-ffffff)', 'var(--ka-c8ccd6)'));
        out.push(box(x + 30, y + h - 52, 80, 22, 0, 9, 'var(--ka-6b7aa0)', 'var(--ka-4f5c80)'), box(x + 30, y + 40, 22, 60, 0, 9, 'var(--ka-6b7aa0)', 'var(--ka-4f5c80)'));
        out.push(box(x + 70, y + 60, 34, 34, 0, 6, WOOD, WOOD_S));
        out.push(...plant(x + 16, y + 16, 12), ...plant(x + w - 16, y + h - 18, 12), ...plant(x + w * 0.45, y + h - 18, 10));
        break;
      }
      case 'lobby': {
        out.push({ pts: rect(x + 40, y + 40, w - 80, h - 80), z0: 0.5, h: 0, top: 'var(--ka-e3dccd)', side: '', flat: true });
        for (let i = 0; i < 4; i++) out.push(...plant(x + 60 + i * ((w - 120) / 3), y + h / 2, 14));
        out.push(box(x + 90, y + 70, 80, 20, 0, 9, 'var(--ka-6b7aa0)', 'var(--ka-4f5c80)'), box(x + w - 170, y + h - 90, 80, 20, 0, 9, 'var(--ka-6b7aa0)', 'var(--ka-4f5c80)'));
        for (let i = 0; i < 6; i++) out.push({ pts: [[x + 60 + r() * (w - 120), y + 40 + r() * (h - 80)]], z0: 0, h: 0, top: '', side: '', person: shirts[i % Math.max(1, shirts.length)] ?? 'var(--ka-2563eb)' });
        break;
      }
      case 'security':
        out.push(box(x + 30, y + 40, w - 60, 22, 0, 13, 'var(--ka-ffffff)', 'var(--ka-c8ccd6)'));
        out.push(...wall(x + 20, y + h - 30, w - 40, 6, 12, 'var(--ka-94a3b8)', 'var(--ka-64748b)'));
        break;
      case 'wellness':
        for (let i = 0; i < 6; i++) out.push(box(x + 30 + i * ((w - 60) / 6), y + 40, 26, 50, 0, 10, 'var(--ka-475569)', 'var(--ka-334155)'));
        out.push({ pts: rect(x + 30, y + 105, w - 60, 30), z0: 0.5, h: 0, top: 'var(--ka-93c5fd)', side: '', flat: true });
        break;
      case 'pods':
        for (let i = 0; i < 2; i++)
          for (let j = 0; j < 2; j++) {
            const px = x + 10 + i * ((w - 20) / 2);
            const py = y + 12 + j * ((h - 24) / 2);
            const pw = (w - 20) / 2 - 8;
            const ph = (h - 24) / 2 - 10;
            out.push(...wall(px, py, pw, 3, 26, 'var(--ka-ddd6fe)', 'var(--ka-b9aef0)', 0.7), ...wall(px, py, 3, ph, 26, 'var(--ka-ddd6fe)', 'var(--ka-b9aef0)', 0.7));
            out.push(box(px + 10, py + 12, pw - 22, 14, 0, 10, DESK, DESK_S), chair(px + pw / 2, py + 36));
          }
        break;
      case 'core':
        out.push(box(x + 8, y + 8, w - 16, h - 16, 0, 34, 'var(--ka-e2e5eb)', 'var(--ka-b9bfcb)'));
        out.push(box(x + 18, y + h - 9, 26, 2, 0, 26, 'var(--ka-8b93a7)', 'var(--ka-6b7389)'), box(x + 52, y + h - 9, 26, 2, 0, 26, 'var(--ka-8b93a7)', 'var(--ka-6b7389)'));
        break;
      case 'hvac':
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 2; j++) out.push(box(x + 30 + i * 125, y + 30 + j * 115, 100, 80, 0, 36, 'var(--ka-cbd5e1)', 'var(--ka-94a3b8)'));
        break;
      case 'solar':
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 7; j++) out.push(box(x + 20 + i * 88, y + 20 + j * 70, 76, 50, 6, 3, 'var(--ka-1e3a8a)', 'var(--ka-172554)'));
        break;
    }
  }
  // perimeter: low parapet + translucent curtain wall
  if (!isRoof) {
    out.push(...wall(20, 18, 960, 4, 36, 'var(--ka-d4e4f2)', GLASS, 0.32, 60), ...wall(18, 20, 4, 520, 36, 'var(--ka-d4e4f2)', GLASS, 0.32, 60));
    out.push(...wall(978, 20, 4, 520, 36, 'var(--ka-d4e4f2)', GLASS, 0.22, 60), ...wall(20, 538, 960, 4, 36, 'var(--ka-d4e4f2)', GLASS, 0.22, 60));
    // interior partition walls along a few zone edges
    const solid = zones.filter((zz) => zz.type === 'meeting' || zz.type === 'reception');
    for (const s of solid) out.push(...wall(s.x + s.w - 2, s.y + 10, 4, s.h - 60, 30, WALL, WALL_S, 0.95));
  } else {
    out.push(...wall(20, 18, 960, 4, 10, 'var(--ka-cbd5e1)', 'var(--ka-94a3b8)'), ...wall(18, 20, 4, 520, 10, 'var(--ka-cbd5e1)', 'var(--ka-94a3b8)'), ...wall(978, 20, 4, 520, 10, 'var(--ka-cbd5e1)', 'var(--ka-94a3b8)'), ...wall(20, 538, 960, 4, 10, 'var(--ka-cbd5e1)', 'var(--ka-94a3b8)'));
  }
  return out;
}

/* ---------- projection ---------- */
export function projector(v: View) {
  const a = (v.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const e = (v.elev * Math.PI) / 180;
  const se = Math.sin(e);
  const ce = Math.cos(e);
  const P = (x: number, y: number, z = 0): Pt => {
    const dx = x - v.cx;
    const dy = y - v.cy;
    const rx = dx * c - dy * s;
    const ry = dx * s + dy * c;
    return [v.ox + v.panX + rx * v.k, v.oy + v.panY + (ry * se - z * ce) * v.k];
  };
  const depth = (x: number, y: number) => (x - v.cx) * s + (y - v.cy) * c;
  /** Inverse projection onto the z = 0 plane. */
  const inv = (sx: number, sy: number): Pt => {
    const rx = (sx - v.ox - v.panX) / v.k;
    const ry = (sy - v.oy - v.panY) / v.k / (se || 1e-6);
    return [rx * c + ry * s + v.cx, -rx * s + ry * c + v.cy];
  };
  return { P, depth, inv, se, ce };
}

const poly = (pts: Pt[]) => 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + 'Z';

export function shade(hex: string, f: number) {
  if (hex.startsWith('var(')) return f <= 1 ? `color-mix(in srgb, ${hex} ${Math.round(f * 100)}%, var(--ka-000000))` : `color-mix(in srgb, ${hex} ${Math.round((2 - f) * 100)}%, var(--ka-ffffff))`;
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** Projects and painter-sorts a scene. Flat patches first, then solids far → near. */
export function render(solids: Solid[], v: View, zLift = 0): Drawn[] {
  const { P, depth, ce } = projector(v);
  const flats: Drawn[] = [];
  const items: { d: number; out: Drawn[] }[] = [];
  for (const so of solids) {
    const z0 = so.z0 + zLift;
    if (so.flat) {
      flats.push({ t: 'poly', d: poly(so.pts.map(([x, y]) => P(x, y, z0))), fill: so.top, op: so.op, stroke: so.stroke, sw: 0.6, ref: so.ref });
      continue;
    }
    const cxp = so.pts.reduce((a, p) => a + p[0], 0) / so.pts.length;
    const cyp = so.pts.reduce((a, p) => a + p[1], 0) / so.pts.length;
    const dc = depth(cxp, cyp);
    if (so.person) {
      const [px, py] = P(cxp, cyp, z0);
      items.push({ d: dc + 0.1, out: [{ t: 'person', x: px, y: py, fill: so.person, s: v.k, ry: ce }] });
      continue;
    }
    if (so.ball) {
      const [px, py] = P(cxp, cyp, z0);
      items.push({ d: dc + 0.2, out: [{ t: 'ball', x: px, y: py, r: so.ball.r * v.k, fill: so.top }] });
      continue;
    }
    const out: Drawn[] = [];
    if (so.h > 0 && ce > 0.02) {
      const n = so.pts.length;
      for (let i = 0; i < n; i++) {
        const a = so.pts[i];
        const b = so.pts[(i + 1) % n];
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        if (depth(mx, my) <= dc + 0.01) continue; // back face
        const f = Math.abs(a[0] - b[0]) > Math.abs(a[1] - b[1]) ? 0.92 : 0.8;
        out.push({ t: 'poly', d: poly([P(a[0], a[1], z0), P(b[0], b[1], z0), P(b[0], b[1], z0 + so.h), P(a[0], a[1], z0 + so.h)]), fill: /^(#|var\()/.test(so.side) ? shade(so.side, f) : so.side, op: so.op });
      }
    }
    out.push({ t: 'poly', d: poly(so.pts.map(([x, y]) => P(x, y, z0 + so.h))), fill: so.top, op: so.op, stroke: so.stroke });
    items.push({ d: dc + so.z0 * 0.8, out });
  }
  items.sort((a, b) => a.d - b.d);
  return [...flats, ...items.flatMap((i) => i.out)];
}

export { poly, rect };
