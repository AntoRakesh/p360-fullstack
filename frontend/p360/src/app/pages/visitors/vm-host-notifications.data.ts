// Hard-coded data for the Host Notifications page (reference image "host notifications.png").
import { SITES } from './vm.data';

export type NKind = 'Arrivals' | 'Approvals' | 'Departures' | 'System';
export type NChannel = 'Email' | 'SMS' | 'Push' | 'Teams';
export type NStatus = 'Delivered' | 'Read' | 'Failed' | 'Queued';
export type NAction = 'Notify Host' | 'Review' | 'View Visit' | 'View Details' | 'Open Schedule';

export interface LiveNote {
  id: string;
  kind: NKind;
  who: string;
  text: string;
  place?: string;
  sub: string;
  ago: number; // minutes ago
  channels: NChannel[];
  action: NAction;
  second?: NAction;
  unread: boolean;
  done?: string; // label shown after the main action was performed
  site: string;
  host: string;
  vid: string;
  status: NStatus;
}

export interface LogEntry {
  id: string;
  ts: number; // minutes since midnight, 15 Oct 2026
  kind: NKind;
  label: string; // bold prefix, e.g. "Visitor arrival:"
  text: string;
  recipient: string;
  channel: NChannel;
  vid: string;
  site: string;
  status: NStatus;
}

export interface RuleTpl {
  id: string;
  name: string;
  icon: string;
  trigger: string;
  triggerText: string;
  channels: NChannel[];
  enabled: boolean;
  site: string;
  recipients: string;
  message: string;
}

export const LIVE: LiveNote[] = [
  { id: 'N1', kind: 'Arrivals', who: 'Arjun Mehta', text: 'has arrived at', place: 'Main Entrance.', sub: 'Visitor VIS-000784 • Host: Priya Sharma', ago: 0, channels: ['Email', 'Push'], action: 'Notify Host', second: 'View Visit', unread: true, site: SITES[0], host: 'Priya Sharma', vid: 'VIS-000784', status: 'Delivered' },
  { id: 'N2', kind: 'Approvals', who: 'Maria Santos', text: 'is awaiting approval from', place: 'Li Wei.', sub: 'Visit VIS-000632 • Site: Main Campus – Tower A', ago: 2, channels: ['Email', 'SMS'], action: 'Review', unread: true, site: SITES[0], host: 'Li Wei', vid: 'VIS-000632', status: 'Read' },
  { id: 'N3', kind: 'Arrivals', who: 'David Lee', text: 'checked in at', place: 'Plant Site – North Block.', sub: 'Visitor VIS-000119 • Host: Ramesh Kumar', ago: 6, channels: ['Email', 'Push'], action: 'View Visit', unread: false, site: SITES[3], host: 'Ramesh Kumar', vid: 'VIS-000119', status: 'Failed' },
  { id: 'N4', kind: 'Departures', who: 'Sarah Khan', text: 'has checked out.', sub: 'Visitor VIS-000103 • Site: Main Campus – Tower B', ago: 10, channels: ['Email'], action: 'View Details', unread: false, site: SITES[1], host: 'Ahmed Hassan', vid: 'VIS-000103', status: 'Queued' },
  { id: 'N5', kind: 'System', who: 'Priya Sharma', text: 'has 3 visitors arriving today.', sub: 'Visitors: VIS-000888, VIS-000889, VIS-000890', ago: 15, channels: ['Email', 'Push'], action: 'Open Schedule', unread: false, site: SITES[0], host: 'Priya Sharma', vid: 'VIS-000888', status: 'Delivered' },
  { id: 'N6', kind: 'Departures', who: 'Chen Wei', text: 'is overdue for check-out at', place: 'Plant Site – North Block.', sub: 'Visitor VIS-000778 • Host: Fatima Ali', ago: 22, channels: ['SMS', 'Push'], action: 'Notify Host', unread: false, site: SITES[2], host: 'Fatima Ali', vid: 'VIS-000778', status: 'Delivered' },
  { id: 'N7', kind: 'Approvals', who: 'Rohan Verma', text: 'was approved by', place: 'Michael Chen.', sub: 'Visit VIS-000801 • Site: Main Campus – Tower A', ago: 34, channels: ['Email', 'Teams'], action: 'View Visit', unread: false, site: SITES[0], host: 'Michael Chen', vid: 'VIS-000801', status: 'Read' },
  { id: 'N8', kind: 'Departures', who: 'Ahmed Raza', text: 'checked out at', place: 'Main Campus – Tower A.', sub: 'Visitor VIS-000776 • Host: Priya Sharma', ago: 58, channels: ['Email'], action: 'View Details', unread: false, site: SITES[0], host: 'Priya Sharma', vid: 'VIS-000776', status: 'Delivered' },
];

export const LOG: LogEntry[] = [
  { id: 'L1', ts: 620, kind: 'Arrivals', label: 'Visitor arrival:', text: 'Arjun Mehta has arrived at Main Entrance.', recipient: 'Priya Sharma', channel: 'Email', vid: 'VIS-000784', site: SITES[0], status: 'Delivered' },
  { id: 'L2', ts: 608, kind: 'Approvals', label: 'Approval request:', text: 'Maria Santos is awaiting approval.', recipient: 'Li Wei', channel: 'SMS', vid: 'VIS-000632', site: SITES[0], status: 'Read' },
  { id: 'L3', ts: 590, kind: 'Arrivals', label: 'Check-in:', text: 'David Lee checked in at Plant Site – North Block.', recipient: 'Ramesh Kumar', channel: 'Push', vid: 'VIS-000119', site: SITES[3], status: 'Failed' },
  { id: 'L4', ts: 576, kind: 'Departures', label: 'Checkout:', text: 'Sarah Khan has checked out.', recipient: 'Ahmed Hassan', channel: 'Email', vid: 'VIS-000103', site: SITES[1], status: 'Queued' },
  { id: 'L5', ts: 570, kind: 'System', label: 'Daily digest:', text: 'Priya Sharma has 3 visitors arriving today.', recipient: 'Priya Sharma', channel: 'Push', vid: 'VIS-000888', site: SITES[0], status: 'Read' },
  { id: 'L6', ts: 562, kind: 'Departures', label: 'Overdue:', text: 'Chen Wei is overdue for check-out.', recipient: 'Fatima Ali', channel: 'SMS', vid: 'VIS-000778', site: SITES[2], status: 'Delivered' },
  { id: 'L7', ts: 545, kind: 'Approvals', label: 'Approved:', text: 'Rohan Verma visit approved by Michael Chen.', recipient: 'Michael Chen', channel: 'Teams', vid: 'VIS-000801', site: SITES[0], status: 'Read' },
  { id: 'L8', ts: 520, kind: 'Departures', label: 'Checkout:', text: 'Ahmed Raza checked out at Main Campus – Tower A.', recipient: 'Priya Sharma', channel: 'Email', vid: 'VIS-000776', site: SITES[0], status: 'Delivered' },
];

export const TEMPLATES: RuleTpl[] = [
  { id: 'T1', name: 'Visitor Arrival Alert', icon: 'bell', trigger: 'Visitor arrived', triggerText: 'When a visitor arrives at the site.', channels: ['Email', 'SMS', 'Push', 'Teams'], enabled: true, site: 'All Sites', recipients: 'Host', message: '{visitor} has arrived at {location}. Please meet them at reception.' },
  { id: 'T2', name: 'Approval Reminder', icon: 'shield-check', trigger: 'Approval overdue', triggerText: 'When a visitor is awaiting host approval for more than 10 minutes.', channels: ['Email', 'SMS'], enabled: true, site: 'All Sites', recipients: 'Host, backup host', message: '{visitor} is still awaiting your approval for {visit_time}.' },
  { id: 'T3', name: 'Visitor Checkout Confirmation', icon: 'vm-c-log-out', trigger: 'Visitor checked out', triggerText: 'When a visitor checks out of the site.', channels: ['Email', 'Push'], enabled: true, site: 'All Sites', recipients: 'Host', message: '{visitor} checked out at {time}. Badge {badge} returned.' },
];

export const TRIGGERS = ['Invitation created', 'Visitor approved', 'Visitor arrived', 'Visitor checked in', 'Visitor checked out', 'Approval overdue'];
export const CHANNELS: NChannel[] = ['Email', 'SMS', 'Push', 'Teams'];
export const CH_ICON: Record<NChannel, string> = { Email: 'vm-c-mail', SMS: 'vm-c-sms', Push: 'bell', Teams: 'vm-c-teams' };
export const RECIPIENTS = ['Host only', 'Host, backup host', 'Host, backup host, security desk', 'Host, security desk', 'Security desk only'];
export const ESCALATIONS = ['Escalate after 5 minutes', 'Escalate after 10 minutes', 'Escalate after 15 minutes', 'Escalate after 30 minutes', 'Never escalate'];
export const AUDIENCES: [string, number][] = [['All hosts', 142], ['Hosts with visitors today', 38], ['Main Campus hosts', 96], ['Plant Site hosts', 31], ['Security desk', 6]];
export const QUIET_TIMES = ['8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM', '6:00 AM', '7:00 AM', '8:00 AM'];

/** "10:20 AM" with zero-padded hour like the reference ("09:50 AM"). */
export const hm2 = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
export const agoLabel = (m: number) => (m <= 0 ? 'Just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} hr ago`);
