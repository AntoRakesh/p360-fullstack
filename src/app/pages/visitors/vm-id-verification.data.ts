// Hard-coded data for the ID Verification page (reference image "ID verification.png").
import { SITES } from './vm.data';

export type VStatus = 'Pending' | 'Needs Review' | 'Verified' | 'Failed' | 'Expired';
export type CheckSt = 'Passed' | 'Clear' | 'Review' | 'Failed' | 'Pending';
export interface VCheck { label: string; icon: string; st: CheckSt }
export interface VHist { text: string; at: number; tone?: 'green' | 'orange' | 'red' | 'blue' }
export interface VItem {
  id: string;
  name: string;
  company: string;
  companyFull: string;
  time: number; // scheduled, minutes since midnight
  queued: number;
  docType: string;
  docNo: string;
  country: string;
  expiry: string;
  site: string;
  host: string;
  purpose: string;
  method: string;
  consent: boolean;
  status: VStatus;
  face: number;
  checks: VCheck[];
  warning: string | null;
  history: VHist[];
}
export interface VActivity { id: string; name: string; company: string; docType: string; docNo: string; method: string; by: string; at: number; result: VStatus | 'Needs Review' }

export const DOC_TYPES = ['Passport', 'National ID', 'Driver License', 'Aadhaar', 'Emirates ID'];
export const METHODS = ['Kiosk + OCR', 'Reception Scanner', 'Manual Upload + OCR', 'Mobile Pre-check'];
export const REVIEW_REASONS = ['Glare / poor image quality', 'Face match below threshold', 'Possible watchlist match', 'Document damaged', 'Name mismatch', 'Other'];
export const REJECT_REASONS = ['Document expired', 'Face does not match', 'Suspected forged document', 'Watchlist match confirmed', 'Visitor refused consent', 'Other'];

const checks = (a: CheckSt, e: CheckSt, n: CheckSt, f: CheckSt, w: CheckSt): VCheck[] => [
  { label: 'Document authenticity', icon: 'shield-check', st: a },
  { label: 'Document not expired', icon: 'calendar-days', st: e },
  { label: 'Name match', icon: 'user', st: n },
  { label: 'Face match', icon: 'vm-b-face-scan', st: f },
  { label: 'Watchlist screening', icon: 'layers', st: w },
];
export const newChecks = () => checks('Passed', 'Passed', 'Passed', 'Passed', 'Clear');

export const QUEUE: VItem[] = [
  { id: 'Q1', name: 'Arjun Mehta', company: 'Tech Solutions', companyFull: 'Tech Solutions Pvt. Ltd.', time: 630, queued: 580, docType: 'Passport', docNo: 'P•••••7842', country: 'India', expiry: '18 Sep 2029', site: SITES[0], host: 'Priya Sharma', purpose: 'Business Meeting', method: 'Kiosk + OCR', consent: true, status: 'Pending', face: 98.4,
    checks: checks('Passed', 'Passed', 'Passed', 'Passed', 'Clear'), warning: 'glare detected on document image.',
    history: [{ text: 'Document uploaded', at: 630 }, { text: 'OCR completed', at: 630 }, { text: 'Face match completed', at: 631 }, { text: 'Watchlist screened', at: 631 }] },
  { id: 'Q2', name: 'Maria Santos', company: 'Global IT', companyFull: 'Global IT Services', time: 870, queued: 585, docType: 'National ID', docNo: 'N•••••6321', country: 'Philippines', expiry: '04 Feb 2030', site: SITES[0], host: 'Li Wei', purpose: 'Interview', method: 'Kiosk + OCR', consent: true, status: 'Needs Review', face: 84.2,
    checks: checks('Passed', 'Passed', 'Passed', 'Review', 'Clear'), warning: 'face match below 90% threshold.',
    history: [{ text: 'Document uploaded', at: 604 }, { text: 'OCR completed', at: 604 }, { text: 'Face match below threshold', at: 605, tone: 'orange' }, { text: 'Watchlist screened', at: 605 }] },
  { id: 'Q3', name: 'David Lee', company: 'ABC Contractors', companyFull: 'ABC Contractors LLC', time: 600, queued: 590, docType: 'Driver License', docNo: 'D•••••1190', country: 'India', expiry: '03 Jan 2031', site: SITES[3], host: 'Ramesh Kumar', purpose: 'Site Visit', method: 'Reception Scanner', consent: true, status: 'Verified', face: 99.1,
    checks: checks('Passed', 'Passed', 'Passed', 'Passed', 'Clear'), warning: null,
    history: [{ text: 'Document scanned', at: 586 }, { text: 'OCR completed', at: 586 }, { text: 'Face match completed', at: 587 }, { text: 'Watchlist screened', at: 587 }, { text: 'Verified by Reception Desk', at: 588 }] },
  { id: 'Q4', name: 'Sarah Khan', company: 'Gulf Logistics', companyFull: 'Gulf Logistics FZE', time: 840, queued: 615, docType: 'Passport', docNo: 'P•••••5521', country: 'Pakistan', expiry: '22 Jun 2030', site: SITES[1], host: 'Ahmed Hassan', purpose: 'Delivery', method: 'Mobile Pre-check', consent: true, status: 'Pending', face: 97.6,
    checks: checks('Passed', 'Passed', 'Passed', 'Passed', 'Clear'), warning: null,
    history: [{ text: 'Document uploaded', at: 612 }, { text: 'OCR completed', at: 613 }, { text: 'Face match completed', at: 614 }, { text: 'Watchlist screened', at: 615 }] },
  { id: 'Q5', name: 'Rahul Nair', company: 'Vertex Systems', companyFull: 'Vertex Systems Pvt. Ltd.', time: 690, queued: 568, docType: 'Driver License', docNo: 'D•••••4471', country: 'India', expiry: '11 Nov 2028', site: SITES[2], host: 'Fatima Ali', purpose: 'Maintenance', method: 'Kiosk + OCR', consent: true, status: 'Needs Review', face: 95.3,
    checks: checks('Passed', 'Passed', 'Passed', 'Passed', 'Review'), warning: 'possible watchlist match (62% similarity).',
    history: [{ text: 'Document uploaded', at: 596 }, { text: 'OCR completed', at: 597 }, { text: 'Face match completed', at: 597 }, { text: 'Potential watchlist match', at: 598, tone: 'orange' }] },
  { id: 'Q6', name: 'Grace Park', company: 'PwC', companyFull: 'PwC India', time: 585, queued: 575, docType: 'Passport', docNo: 'P•••••0093', country: 'South Korea', expiry: '30 Mar 2032', site: SITES[0], host: 'Michael Chen', purpose: 'Audit', method: 'Reception Scanner', consent: true, status: 'Verified', face: 98.9,
    checks: checks('Passed', 'Passed', 'Passed', 'Passed', 'Clear'), warning: null,
    history: [{ text: 'Document scanned', at: 574 }, { text: 'OCR completed', at: 574 }, { text: 'Face match completed', at: 575 }, { text: 'Verified by Priya Sharma', at: 582 }] },
  { id: 'Q7', name: 'Chen Wei', company: 'Facility Services', companyFull: 'Facility Services Co.', time: 540, queued: 552, docType: 'Aadhaar', docNo: 'XXXX XXXX 4410', country: 'India', expiry: '—', site: SITES[2], host: 'Fatima Ali', purpose: 'Maintenance', method: 'Kiosk + OCR', consent: true, status: 'Failed', face: 62.5,
    checks: checks('Passed', 'Passed', 'Failed', 'Failed', 'Clear'), warning: 'face and name do not match the registered visitor.',
    history: [{ text: 'Document uploaded', at: 550 }, { text: 'Name mismatch detected', at: 551, tone: 'red' }, { text: 'Face match failed (62.5%)', at: 551, tone: 'red' }, { text: 'Rejected by Security Desk', at: 555, tone: 'red' }] },
  { id: 'Q8', name: 'Omar Yusuf', company: 'DHL', companyFull: 'DHL Express', time: 555, queued: 545, docType: 'Emirates ID', docNo: '784-••••-••••-2', country: 'UAE', expiry: '02 Sep 2026', site: SITES[1], host: 'Ahmed Hassan', purpose: 'Delivery', method: 'Reception Scanner', consent: true, status: 'Expired', face: 96.1,
    checks: checks('Passed', 'Failed', 'Passed', 'Passed', 'Clear'), warning: 'document expired on 02 Sep 2026.',
    history: [{ text: 'Document scanned', at: 543 }, { text: 'OCR completed', at: 543 }, { text: 'Document expired', at: 544, tone: 'red' }] },
];

export const ACTIVITY: VActivity[] = [
  { id: 'A1', name: 'Arjun Mehta', company: 'Tech Solutions', docType: 'Passport', docNo: 'P•••••7842', method: 'Kiosk + OCR', by: 'Priya Sharma', at: 631, result: 'Verified' },
  { id: 'A2', name: 'Maria Santos', company: 'Global IT', docType: 'National ID', docNo: 'N•••••6321', method: 'Kiosk + OCR', by: 'Reception Desk', at: 876, result: 'Needs Review' },
  { id: 'A3', name: 'David Lee', company: 'ABC Contractors', docType: 'Driver License', docNo: 'D•••••1190', method: 'Kiosk + OCR', by: 'Reception Desk', at: 608, result: 'Failed' },
  { id: 'A4', name: 'Grace Park', company: 'PwC', docType: 'Passport', docNo: 'P•••••0093', method: 'Reception Scanner', by: 'Priya Sharma', at: 582, result: 'Verified' },
  { id: 'A5', name: 'Chen Wei', company: 'Facility Services', docType: 'Aadhaar', docNo: 'X•••••4410', method: 'Kiosk + OCR', by: 'Security Desk', at: 555, result: 'Failed' },
  { id: 'A6', name: 'Omar Yusuf', company: 'DHL', docType: 'Emirates ID', docNo: '7•••••2', method: 'Reception Scanner', by: 'Reception Desk', at: 544, result: 'Expired' },
];

export const hm2 = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
/** "10:30 AM" without zero padding (queue column). */
export const hm1 = (m: number) => hm2(m).replace(/^0/, '');
