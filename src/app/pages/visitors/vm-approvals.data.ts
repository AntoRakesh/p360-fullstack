// Visitor Approvals: approval requests for upcoming visits + root store shared with other visitor pages.
// Demo "today" = Wed 14 Oct 2026 (reference image). Counts match the image: 24 pending (8 mine, 6 high priority,
// 12 today), 38 approved today, 3 rejected today, 46 arriving today.
import { Injectable, computed, inject, signal } from '@angular/core';
import { AREAS, HOSTS, PURPOSES, SITES, VISITOR_TYPES, VmStore, hostOf } from './vm.data';

export type ApprState = 'Pending Approval' | 'Approved' | 'Rejected' | 'Changes Requested';
export type Risk = 'Low' | 'Medium' | 'High';
export interface ApprStep { text: string; at: string; tone: 'green' | 'red' | 'orange' | 'blue' }
export interface ApprRequest {
  id: string; // APR-24017
  name: string;
  company: string;
  companyFull: string;
  type: string;
  purpose: string;
  host: string;
  site: string;
  day: number; // offset from 14 Oct 2026
  time: number; // minutes since midnight
  areas: string[];
  risk: Risk;
  vip: boolean;
  mine: boolean;
  idv: 'Verified' | 'Pending';
  nda: 'Not Required' | 'Signed' | 'Pending';
  safety: 'Required' | 'Link Sent' | 'Completed' | 'Not Required';
  watch: 'Clear' | 'Potential Match';
  status: ApprState;
  recent: boolean; // decided today, still shown in the pending queue
  notes: string;
  history: ApprStep[];
}

const BASE = new Date(2026, 9, 14);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayDate = (d: number) => new Date(BASE.getFullYear(), BASE.getMonth(), BASE.getDate() + d);
export const fmtDay = (d: number) => { const x = dayDate(d); return `${WD[x.getDay()]}, ${x.getDate()} ${MO[x.getMonth()]} ${x.getFullYear()}`; };
export const fmtTime = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export const shortTime = (m: number) => fmtTime(m).replace(/^0/, '');
export const stamp = (m: number) => `${fmtDay(0)}, ${fmtTime(m)}`;

const CAST: Partial<ApprRequest>[] = [
  { name: 'Arjun Mehta', company: 'Tech Solutions', companyFull: 'Tech Solutions Pvt. Ltd.', purpose: 'Business Meeting', host: 'Priya Sharma', site: SITES[0], day: 1, time: 630, areas: ['Main Entrance', 'Meeting Rooms', 'Visitor Lounge'], risk: 'Low', mine: true, idv: 'Verified', nda: 'Not Required', safety: 'Required', watch: 'Clear' },
  { name: 'Maria Santos', company: 'Global IT', type: 'Interview Candidate', purpose: 'Interview', host: 'Li Wei', site: SITES[0], day: 2, time: 870, areas: ['Main Entrance', 'Meeting Rooms'], risk: 'Medium', mine: true, idv: 'Verified', nda: 'Signed', safety: 'Not Required', watch: 'Clear' },
  { name: 'David Lee', company: 'ABC Contractors', type: 'Contractor', purpose: 'Site Visit', host: 'Ramesh Kumar', site: SITES[3], day: 2, time: 600, areas: ['Main Entrance', 'Plant Floor'], risk: 'High', idv: 'Pending', nda: 'Pending', safety: 'Required', watch: 'Potential Match' },
  { name: 'Sarah Khan', company: 'Gulf Logistics', type: 'Delivery', purpose: 'Delivery', host: 'Ahmed Hassan', site: SITES[1], day: 0, time: 840, areas: ['Main Entrance', 'Reception'], risk: 'Low', idv: 'Verified', nda: 'Not Required', safety: 'Not Required', watch: 'Clear', status: 'Approved', recent: true },
  { name: 'Chen Wei', company: 'Facility Services', type: 'Vendor', purpose: 'Maintenance', host: 'Fatima Ali', site: SITES[2], day: 3, time: 540, areas: ['Main Entrance', 'Plant Floor'], risk: 'Medium', idv: 'Verified', nda: 'Signed', safety: 'Required', watch: 'Clear' },
];
const FIRST = ['Rohan', 'Aisha', 'Vikram', 'Neha', 'Karan', 'Meera', 'Omar', 'Hana', 'Rahul', 'Sara', 'Imran', 'Emily', 'Tom', 'Nadia', 'Yusuf', 'Olivia', 'Sanjay', 'Layla', 'Daniel', 'Grace', 'Faisal', 'Anil', 'Zara', 'Ken'];
const LAST = ['Verma', 'Noor', 'Iyer', 'Gupta', 'Malik', 'Clark', 'Yusuf', 'Brown', 'Nair', 'Ahmed', 'Kapoor', 'Wong', 'Patel', 'Karim', 'Singh', 'Das'];
const COS = ['Vertex Systems', 'Purple Holdings', 'Global Ventures', 'Blue Dart', 'Siemens', 'PwC', 'DHL', 'Infosys', 'SecureTech', 'Tech Solutions', 'Global IT', 'Facility Services'];
const rnd = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

function seed(): ApprRequest[] {
  const r = rnd(2417);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const out: ApprRequest[] = [];
  let n = 0;
  const mk = (c: Partial<ApprRequest>): ApprRequest => {
    const host = c.host ?? pick(HOSTS.slice(0, 7)).name;
    const status = c.status ?? 'Pending Approval';
    const time = c.time ?? 540 + Math.floor(r() * 16) * 30;
    const submitted = 520 + Math.floor(r() * 60);
    const idv = c.idv ?? (r() < 0.8 ? 'Verified' : 'Pending');
    const history: ApprStep[] = [
      { text: `Submitted by ${host} (Host)`, at: stamp(submitted), tone: 'green' },
      { text: 'Host notified', at: stamp(submitted + 2), tone: 'green' },
    ];
    if (idv === 'Verified') history.push({ text: 'ID document verified', at: stamp(submitted + 10), tone: 'green' });
    if (status === 'Approved') history.push({ text: 'Approved by Security Desk', at: stamp(submitted + 40), tone: 'green' });
    if (status === 'Rejected') history.push({ text: 'Rejected by Security Desk – incomplete documents', at: stamp(submitted + 35), tone: 'red' });
    const company = c.company ?? pick(COS);
    return {
      id: `APR-${24017 - n++}`,
      name: c.name ?? `${pick(FIRST)} ${pick(LAST)}`,
      company,
      companyFull: c.companyFull ?? company,
      type: c.type ?? 'Business Visitor',
      purpose: c.purpose ?? pick(PURPOSES.slice(0, 6)),
      host,
      site: c.site ?? pick(SITES.slice(0, 4)),
      day: c.day ?? 0,
      time,
      areas: c.areas ?? ['Main Entrance', pick(AREAS.slice(1, 7))],
      risk: c.risk ?? (r() < 0.75 ? 'Low' : 'Medium'),
      vip: c.vip ?? false,
      mine: c.mine ?? false,
      idv,
      nda: c.nda ?? (r() < 0.6 ? 'Not Required' : 'Signed'),
      safety: c.safety ?? (r() < 0.5 ? 'Not Required' : 'Required'),
      watch: c.watch ?? 'Clear',
      status,
      recent: c.recent ?? false,
      notes: '',
      history,
    };
  };
  for (const c of CAST) out.push(mk(c));
  // 20 more pending → 24 total. 12 today, 6 high priority (David + 5), 8 mine (Arjun, Maria + 6).
  for (let i = 0; i < 20; i++)
    out.push(mk({
      day: i < 12 ? 0 : 1 + (i % 4),
      risk: i < 3 ? 'High' : undefined,
      vip: i === 3 || i === 4,
      type: i === 3 || i === 4 ? 'VIP' : pick(VISITOR_TYPES.slice(0, 6)),
      watch: i === 1 ? 'Potential Match' : undefined,
      mine: i >= 5 && i < 11,
    }));
  // 37 more approved today (Sarah is the 38th) and 3 rejected.
  for (let i = 0; i < 37; i++) out.push(mk({ status: 'Approved', day: i < 20 ? 0 : 1 + (i % 3), idv: 'Verified' }));
  for (let i = 0; i < 3; i++) out.push(mk({ status: 'Rejected', day: 1 + i, risk: i === 0 ? 'High' : 'Medium' }));
  return out;
}

export interface ApprRule { name: string; desc: string; on: boolean }

@Injectable({ providedIn: 'root' })
export class ApprovalStore {
  private readonly vm = inject(VmStore);
  readonly requests = signal<ApprRequest[]>(seed());
  /** Arriving today = approved visits for today already in the visitor register (46 in the image). */
  private readonly arrivingBase = 46 - this.requests().filter((q) => q.status === 'Approved' && q.day === 0).length;
  readonly rules = signal<ApprRule[]>([
    { name: 'Auto-approve low-risk repeat visitors', desc: 'Visitors with 3+ clean visits in 90 days and verified ID', on: true },
    { name: 'Security review for high risk', desc: 'High-risk or watchlist matches need Security Desk approval', on: true },
    { name: 'Second approver for VIP / Executive Floor', desc: 'Executive Office must co-approve VIP and executive-floor access', on: true },
    { name: 'Safety briefing before plant access', desc: 'Plant Floor access requires a completed safety briefing', on: true },
    { name: 'Auto-reject after 48 h without action', desc: 'Pending requests expire and the host is notified', on: false },
  ]);

  readonly pending = computed(() => this.requests().filter((q) => q.status === 'Pending Approval' || q.status === 'Changes Requested'));
  readonly approvedToday = computed(() => this.requests().filter((q) => q.status === 'Approved').length);
  readonly rejectedToday = computed(() => this.requests().filter((q) => q.status === 'Rejected').length);
  readonly arrivingToday = computed(() => this.arrivingBase + this.requests().filter((q) => q.status === 'Approved' && q.day === 0).length);

  byId(id: string) { return this.requests().find((q) => q.id === id) ?? null; }
  patch(id: string, c: Partial<ApprRequest>) { this.requests.update((l) => l.map((q) => (q.id === id ? { ...q, ...c } : q))); }
  private step(id: string, s: ApprStep) { const q = this.byId(id); if (q) this.patch(id, { history: [...q.history, s] }); }
  now() { return stamp(this.vm.now()); }

  approve(id: string, note: string) {
    const q = this.byId(id); if (!q) return;
    this.patch(id, { status: 'Approved', recent: true, notes: note });
    this.step(id, { text: `Approved by Demo login${note ? ' – “' + note + '”' : ''}`, at: this.now(), tone: 'green' });
    this.step(id, { text: `Host ${q.host} & visitor notified (Email + SMS)`, at: this.now(), tone: 'green' });
    if (q.day === 0) this.vm.add({ name: q.name, company: q.companyFull, type: q.type, purpose: q.purpose, host: q.host, site: q.site, areas: q.areas, arrival: q.time, risk: q.risk }, 'Expected');
    this.vm.log({ text: `Visit request for ${q.name} approved (${fmtDay(q.day)})`, kind: 'approval' });
  }
  reject(id: string, reason: string, note: string) {
    const q = this.byId(id); if (!q) return;
    this.patch(id, { status: 'Rejected', recent: true, notes: note });
    this.step(id, { text: `Rejected – ${reason}${note ? ': ' + note : ''}`, at: this.now(), tone: 'red' });
    this.vm.log({ text: `Visit request for ${q.name} rejected (${reason})`, kind: 'approval' });
  }
  requestChanges(id: string, fields: string[], msg: string) {
    const q = this.byId(id); if (!q) return;
    this.patch(id, { status: 'Changes Requested', recent: false });
    this.step(id, { text: `Changes requested from ${q.host}: ${fields.join(', ')}${msg ? ' – ' + msg : ''}`, at: this.now(), tone: 'orange' });
  }
  note(id: string, text: string, tone: ApprStep['tone'] = 'blue') { this.step(id, { text, at: this.now(), tone }); }
}

export { hostOf };
