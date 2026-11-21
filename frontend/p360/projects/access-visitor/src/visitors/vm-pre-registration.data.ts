// Pre-registrations (future/today appointments) for the Pre-Registration page.
import { Injectable, signal } from '@angular/core';
import { HOSTS, PURPOSES, SITES } from './vm.data';

export type PreRegStatus = 'Confirmed' | 'Pending Approval' | 'Draft' | 'Expired' | 'Cancelled' | 'Checked In';
export interface PreReg {
  id: string; // PRE-xxxx
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
  /** day offset from "today" (AppState.date) */
  day: number;
  from: number; // minutes since midnight
  to: number;
  count: number;
  areas: string[];
  vehicle: string;
  parking: boolean;
  nda: boolean;
  safety: boolean;
  invite: boolean;
  status: PreRegStatus;
}

const CAST: PreReg[] = [
  { id: 'PRE-1048', name: 'Arjun Mehta', company: 'Tech Solutions Pvt. Ltd.', type: 'Business Visitor', email: 'arjun.mehta@techsolutions.com', phone: '+91 98765 43210', idType: 'Aadhaar', idNo: '1234 5678 9012', purpose: 'Business Meeting', host: 'Priya Sharma', dept: 'Business Development', site: SITES[0], day: 0, from: 630, to: 750, count: 1, areas: ['Main Entrance', 'Meeting Rooms', 'Visitor Lounge'], vehicle: 'DL 4C AB 1234', parking: true, nda: false, safety: true, invite: true, status: 'Confirmed' },
  { id: 'PRE-1047', name: 'Sarah Khan', company: 'Gulf Logistics', type: 'Delivery', email: 'sarah.khan@gulflogistics.com', phone: '+91 98450 11872', idType: 'Passport', idNo: 'P5521873', purpose: 'Delivery', host: 'Ahmed Hassan', dept: 'Logistics', site: SITES[1], day: 0, from: 840, to: 900, count: 1, areas: ['Main Entrance', 'Reception'], vehicle: 'MH 12 GL 4411', parking: true, nda: false, safety: false, invite: true, status: 'Pending Approval' },
  { id: 'PRE-1046', name: 'David Lee', company: 'ABC Contractors', type: 'Contractor', email: 'david.lee@abccontractors.com', phone: '+91 99020 55410', idType: 'Driver License', idNo: 'DL-0420191190', purpose: 'Site Visit', host: 'Ramesh Kumar', dept: 'Plant Operations', site: SITES[3], day: 1, from: 600, to: 780, count: 3, areas: ['Main Entrance', 'Plant Floor'], vehicle: '', parking: false, nda: true, safety: true, invite: true, status: 'Confirmed' },
  { id: 'PRE-1045', name: 'Maria Santos', company: 'Global IT', type: 'Interview Candidate', email: 'maria.santos@globalit.com', phone: '+91 98111 63210', idType: 'National ID', idNo: 'N88216321', purpose: 'Interview', host: 'Li Wei', dept: 'Human Resources', site: SITES[0], day: 1, from: 870, to: 960, count: 1, areas: ['Main Entrance', 'Meeting Rooms', 'Visitor Lounge'], vehicle: '', parking: false, nda: false, safety: false, invite: false, status: 'Draft' },
  { id: 'PRE-1044', name: 'Chen Wei', company: 'Facility Services', type: 'Vendor', email: 'chen.wei@facilityservices.com', phone: '+91 97400 34410', idType: 'Aadhaar', idNo: '5521 0093 4410', purpose: 'Maintenance', host: 'Fatima Ali', dept: 'Facilities', site: SITES[2], day: 2, from: 540, to: 660, count: 2, areas: ['Main Entrance', 'Plant Floor'], vehicle: 'KA 05 FS 2290', parking: true, nda: true, safety: true, invite: true, status: 'Pending Approval' },
];

const NAMES = ['Rohan Verma', 'Aisha Noor', 'Vikram Iyer', 'Neha Gupta', 'Karan Malik', 'Emily Clark', 'Omar Yusuf', 'Olivia Brown', 'Rahul Nair', 'Sara Ahmed', 'Imran Kapoor', 'Tom Wong', 'Nadia Karim', 'Sanjay Singh', 'Grace Park', 'Daniel Das', 'Layla Hassan', 'Faisal Patel'];
const COS = ['Vertex Systems', 'Purple Holdings', 'Global Ventures', 'Blue Dart', 'Siemens', 'PwC', 'DHL', 'Infosys', 'SecureTech'];
const TYPES = ['Business Visitor', 'Contractor', 'Vendor', 'Interview Candidate', 'VIP', 'Delivery'];
const STAT: PreRegStatus[] = ['Confirmed', 'Confirmed', 'Pending Approval', 'Confirmed', 'Expired', 'Draft', 'Confirmed', 'Pending Approval', 'Expired', 'Cancelled'];

function gen(): PreReg[] {
  return NAMES.map((name, i) => {
    const h = HOSTS[i % 6];
    const st = STAT[i % STAT.length];
    const day = st === 'Expired' ? -1 - (i % 4) : 3 + (i % 6);
    const from = 540 + ((i * 67) % 8) * 30;
    const co = COS[i % COS.length];
    return {
      id: `PRE-${1043 - i}`,
      name,
      company: co,
      type: TYPES[i % TYPES.length],
      email: `${name.toLowerCase().replace(' ', '.')}@${co.toLowerCase().replace(/[^a-z]/g, '')}.com`,
      phone: `+91 9${8000 + i * 137} ${String(10000 + i * 4111).slice(0, 5)}`,
      idType: ['Aadhaar', 'Passport', 'National ID'][i % 3],
      idNo: `${4000 + i * 311} ${5100 + i * 17} ${8000 + i}`,
      purpose: PURPOSES[i % PURPOSES.length],
      host: h.name,
      dept: h.dept,
      site: h.site,
      day,
      from,
      to: from + 60 + (i % 3) * 30,
      count: 1 + (i % 3),
      areas: ['Main Entrance', i % 2 ? 'Meeting Rooms' : 'Reception'],
      vehicle: '',
      parking: i % 2 === 0,
      nda: i % 4 === 0,
      safety: true,
      invite: true,
      status: st,
    };
  });
}

@Injectable({ providedIn: 'root' })
export class PreRegStore {
  readonly list = signal<PreReg[]>([...CAST, ...gen()]);
  private seq = 1049;
  nextId() { return `PRE-${this.seq++}`; }
}
