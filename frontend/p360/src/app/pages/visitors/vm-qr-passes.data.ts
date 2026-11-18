// Data + store for the "QR Invitations & Digital Passes" page (agent g).
import { Injectable, computed, signal } from '@angular/core';
import { dayLabel, shortDay } from './vm-a-kit';
import { hm } from './vm.data';

/** Demo "today" = Wed, 15 Oct 2026. */
export const QR_BASE = new Date(2026, 9, 15);
export const PASS_TYPES = ['Visitor Day Pass', 'Contractor Pass', 'Site Visit Pass', 'Delivery Pass', 'Multi-day Pass', 'VIP Pass'];
export const SCAN_LIMITS = [1, 2, 3, 4, 5, 10, 0]; // 0 = unlimited

export type PassStatus = 'Active' | 'Used' | 'Expired' | 'Revoked' | 'Draft';
export interface QrPass {
  id: string;
  visitor: string;
  contact: string;
  company: string;
  type: string;
  host: string;
  purpose: string;
  site: string;
  areas: string[];
  /** day offsets from QR_BASE + minutes since midnight */
  fromDay: number;
  fromTime: number;
  untilDay: number;
  untilTime: number;
  /** override label when validity is a plain date in the reference image */
  validLabel?: string;
  scans: number;
  limit: number;
  reentry: boolean;
  idCheck: boolean;
  via: 'Email' | 'SMS';
  status: PassStatus;
  sentAt: string;
}

export const validity = (p: Pick<QrPass, 'fromDay' | 'fromTime' | 'untilDay' | 'untilTime' | 'validLabel'>) => {
  if (p.validLabel) return p.validLabel;
  const sameDay = p.fromDay === p.untilDay;
  const d = p.fromDay === 0 ? 'Today' : shortDay(QR_BASE, p.fromDay);
  return sameDay ? `${d} ${hm(p.fromTime)}–${hm(p.untilTime)}` : `${d} – ${p.untilDay === 0 ? 'Today' : shortDay(QR_BASE, p.untilDay)}`;
};
/** Long form used on the pass: "15 Oct 2026 · 10:30 AM – 12:30 PM". */
export const validityLong = (p: Pick<QrPass, 'fromDay' | 'fromTime' | 'untilDay' | 'untilTime'>) =>
  p.fromDay === p.untilDay
    ? `${shortDay(QR_BASE, p.fromDay)} · ${hm(p.fromTime)} – ${hm(p.untilTime)}`
    : `${shortDay(QR_BASE, p.fromDay)} ${hm(p.fromTime)} – ${shortDay(QR_BASE, p.untilDay)} ${hm(p.untilTime)}`;
export const dayOpt = (o: number) => dayLabel(QR_BASE, o);
export const scansLabel = (p: QrPass) => `${p.scans} of ${p.limit || '∞'}`;

const P = (id: string, visitor: string, company: string, type: string, host: string, site: string, extra: Partial<QrPass>): QrPass => ({
  id, visitor, company, type, host, site,
  contact: `${visitor.toLowerCase().replace(/[^a-z]+/g, '.')}@${company.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14)}.com`,
  purpose: 'Business Meeting', areas: ['Main Entrance', 'Meeting Rooms'],
  fromDay: 0, fromTime: 600, untilDay: 0, untilTime: 780, scans: 0, limit: 1,
  reentry: false, idCheck: false, via: 'Email', status: 'Active', sentAt: '15 Oct 2026, 08:10 AM',
  ...extra,
});

const SEED: QrPass[] = [
  P('VIS-000784', 'Arjun Mehta', 'Tech Solutions Pvt. Ltd.', 'Visitor Day Pass', 'Priya Sharma', 'Main Campus – Tower A', { contact: 'arjun.mehta@techsolutions.com', areas: ['Main Entrance', 'Meeting Rooms', 'Visitor Lounge'], fromTime: 630, untilTime: 750, limit: 3, reentry: true, sentAt: '14 Oct 2026, 05:42 PM' }),
  P('VIS-000783', 'Maria Santos', 'Global IT', 'Contractor Pass', 'Li Wei', 'Main Campus – Tower A', { purpose: 'Interview', fromDay: 1, untilDay: 1, fromTime: 540, untilTime: 1080, validLabel: '16 Oct 2026', scans: 1, limit: 5, reentry: true, idCheck: true, sentAt: '14 Oct 2026, 11:05 AM' }),
  P('VIS-000782', 'David Lee', 'ABC Contractors', 'Site Visit Pass', 'Ramesh Kumar', 'Plant Site – North Block', { purpose: 'Site Visit', areas: ['Main Entrance', 'Plant Floor'], fromTime: 600, untilTime: 780, scans: 1, limit: 1, status: 'Used', idCheck: true, sentAt: '14 Oct 2026, 04:05 PM' }),
  P('VIS-000781', 'Sarah Khan', 'Gulf Logistics', 'Delivery Pass', 'Ahmed Hassan', 'Main Campus – Tower B', { purpose: 'Delivery', areas: ['Main Entrance', 'Reception'], fromTime: 480, untilTime: 540, validLabel: 'Today', status: 'Expired', via: 'SMS', contact: '+91 98450 22118', sentAt: '15 Oct 2026, 07:12 AM' }),
  P('VIS-000779', 'Rohan Verma', 'Vertex Systems', 'Visitor Day Pass', 'Michael Chen', 'Main Campus – Tower A', { fromTime: 690, untilTime: 840, limit: 2, sentAt: '15 Oct 2026, 08:45 AM' }),
  P('VIS-000777', 'Aisha Noor', 'PwC', 'Multi-day Pass', 'Maria Santos', 'Main Campus – Tower A', { purpose: 'Audit', fromDay: 0, untilDay: 2, fromTime: 540, untilTime: 1080, scans: 2, limit: 0, reentry: true, idCheck: true, sentAt: '13 Oct 2026, 03:20 PM' }),
  P('VIS-000774', 'Karan Malik', 'Facility Services', 'Contractor Pass', 'Fatima Ali', 'Main Campus – Tower C', { purpose: 'Maintenance', areas: ['Main Entrance', 'Plant Floor', 'Server Room'], fromTime: 480, untilTime: 1020, scans: 3, limit: 4, reentry: true, sentAt: '14 Oct 2026, 06:30 PM' }),
  P('VIS-000772', 'Emily Clark', 'Global Ventures', 'VIP Pass', 'Rex Kumar', 'Executive Entrance – Tower A', { purpose: 'Executive Meeting', areas: ['Main Entrance', 'Executive Floor', 'Boardroom'], fromTime: 900, untilTime: 990, limit: 2, idCheck: true, sentAt: '15 Oct 2026, 09:02 AM' }),
  P('VIS-000769', 'Omar Yusuf', 'DHL', 'Delivery Pass', 'Ahmed Hassan', 'Main Campus – Tower B', { purpose: 'Delivery', areas: ['Parking Gate', 'Reception'], fromTime: 540, untilTime: 570, scans: 1, status: 'Used', via: 'SMS', contact: '+91 99011 22334', sentAt: '15 Oct 2026, 07:55 AM' }),
  P('VIS-000766', 'Neha Gupta', 'Infosys', 'Visitor Day Pass', 'Priya Sharma', 'Main Campus – Tower A', { purpose: 'Training', fromDay: -1, untilDay: -1, fromTime: 600, untilTime: 960, scans: 1, limit: 2, status: 'Expired', sentAt: '13 Oct 2026, 10:10 AM' }),
  P('VIS-000763', 'Tom Wong', 'SecureTech', 'Site Visit Pass', 'Ramesh Kumar', 'Plant Site – North Block', { purpose: 'Site Visit', fromDay: 1, untilDay: 1, fromTime: 600, untilTime: 720, status: 'Revoked', sentAt: '12 Oct 2026, 02:40 PM' }),
  P('VIS-000761', 'Grace Park', 'Siemens', 'Contractor Pass', 'Fatima Ali', 'Main Campus – Tower C', { purpose: 'Maintenance', fromDay: 0, untilDay: 4, fromTime: 480, untilTime: 1080, scans: 4, limit: 10, reentry: true, sentAt: '11 Oct 2026, 09:15 AM' }),
];

@Injectable({ providedIn: 'root' })
export class QrPassStore {
  readonly passes = signal<QrPass[]>(SEED);
  // Baselines so the KPI tiles match the reference (86 / 142 / 38 / 12) while still reacting to changes.
  private readonly base = (() => {
    const l = SEED;
    return {
      active: 86 - l.filter((p) => p.status === 'Active').length,
      sent: 142 - l.filter((p) => p.status !== 'Draft').length,
      used: 38 - l.filter((p) => p.scans > 0 && p.fromDay <= 0 && p.untilDay >= 0).length,
      expiring: 12 - l.filter(isExpiring).length,
    };
  })();
  readonly kpi = computed(() => {
    const l = this.passes();
    return {
      active: this.base.active + l.filter((p) => p.status === 'Active').length,
      sent: this.base.sent + l.filter((p) => p.status !== 'Draft').length,
      used: this.base.used + l.filter((p) => p.scans > 0 && p.fromDay <= 0 && p.untilDay >= 0).length,
      expiring: this.base.expiring + l.filter(isExpiring).length,
    };
  });
  byId(id: string) { return this.passes().find((p) => p.id === id) ?? null; }
  upsert(p: QrPass) { this.passes.update((l) => (l.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? p : x)) : [p, ...l])); }
  patch(id: string, c: Partial<QrPass>) { this.passes.update((l) => l.map((p) => (p.id === id ? { ...p, ...c } : p))); }
  remove(id: string) { this.passes.update((l) => l.filter((p) => p.id !== id)); }
}
/** Active and ending today (before 8 PM). */
export const isExpiring = (p: QrPass) => p.status === 'Active' && p.untilDay === 0;
