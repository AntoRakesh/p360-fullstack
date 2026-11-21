// Recent walk-in registrations shown on the Walk-in Registration page (image cast first).
import { Injectable, signal } from '@angular/core';
import { HOSTS } from './vm.data';

export type WalkStatus = 'Checked In' | 'Pending Approval' | 'Checked Out';
export interface WalkIn {
  badge: string;
  name: string;
  company: string;
  type: string;
  email: string;
  phone: string;
  idType: string;
  idNo: string;
  purpose: string;
  host: string;
  dept: string;
  site: string;
  duration: number; // minutes
  count: number;
  areas: string[];
  vehicle: string;
  parking: boolean;
  nda: boolean;
  safety: boolean;
  badgeType: string;
  notify: boolean;
  /** check-in minutes since midnight, today */
  at: number;
  status: WalkStatus;
}

const W = (badge: string, name: string, company: string, purpose: string, host: string, at: number, status: WalkStatus, type = 'Business Visitor'): WalkIn => {
  const h = HOSTS.find((x) => x.name === host) ?? HOSTS[0];
  return {
    badge, name, company, type, purpose, host, at, status,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${company.toLowerCase().split(' ')[0].replace(/[^a-z]/g, '')}.com`,
    phone: `+91 9${(8765 + at).toString().slice(0, 4)} ${String(43210 + at).slice(0, 5)}`,
    idType: 'Aadhaar', idNo: `${1234 + at} 5678 ${9000 + at}`.slice(0, 14),
    dept: h.dept, site: h.site, duration: 120, count: 1, areas: ['Main Entrance', 'Meeting Rooms'], vehicle: '',
    parking: false, nda: false, safety: true, badgeType: 'Visitor Badge (Day Pass)', notify: true,
  };
};

const SEED: WalkIn[] = [
  { ...W('VIS-000784', 'Arjun Mehta', 'Tech Solutions Pvt. Ltd.', 'Business Meeting', 'Priya Sharma', 624, 'Checked In'), email: 'arjun.mehta@techsolutions.com', phone: '+91 98765 43210', idNo: '1234 5678 9012', areas: ['Main Entrance', 'Meeting Rooms', 'Visitor Lounge'], vehicle: 'DL 4C AB 1234', parking: true },
  W('VIS-000783', 'Maria Santos', 'Global IT', 'Project Discussion', 'Li Wei', 598, 'Pending Approval', 'Interview Candidate'),
  W('VIS-000782', 'David Lee', 'ABC Contractors', 'Site Visit', 'Ramesh Kumar', 561, 'Checked In', 'Contractor'),
  W('VIS-000781', 'Sarah Khan', 'Gulf Logistics', 'Delivery', 'Ahmed Hassan', 520, 'Checked Out', 'Delivery'),
  W('VIS-000780', 'Chen Wei', 'Facility Services', 'Maintenance', 'Fatima Ali', 495, 'Checked In', 'Vendor'),
  W('VIS-000779', 'Rohan Verma', 'Vertex Systems', 'Business Meeting', 'Michael Chen', 482, 'Checked Out'),
  W('VIS-000777', 'Aisha Noor', 'Purple Holdings', 'Interview', 'Li Wei', 471, 'Checked In', 'Interview Candidate'),
  W('VIS-000775', 'Karan Malik', 'Blue Dart', 'Delivery', 'Ahmed Hassan', 465, 'Checked Out', 'Delivery'),
  W('VIS-000774', 'Emily Clark', 'PwC', 'Audit', 'Maria Santos', 458, 'Checked In', 'Vendor'),
  W('VIS-000772', 'Omar Yusuf', 'Siemens', 'Maintenance', 'Fatima Ali', 450, 'Checked In', 'Contractor'),
];

@Injectable({ providedIn: 'root' })
export class WalkInStore {
  readonly list = signal<WalkIn[]>(SEED);
  readonly drafts = signal<WalkIn[]>([]);
}
