// Seed data + root store for Watchlist & Restricted Visitors (reference image 06_04_10).
import { Injectable, computed, signal } from '@angular/core';

export type AlertStatus = 'Open' | 'Under Review' | 'Cleared' | 'Restricted';
export interface AuditItem { title: string; at: string; by: string }
export interface ScreenAlert {
  id: number;
  name: string;
  match: 'Name similarity' | 'Document match' | 'No match' | 'Biometric match';
  conf: number;
  source: 'Internal Watchlist' | 'Restricted Visitors' | 'Screening Service';
  site: string;
  detected: string;
  risk: 'Low' | 'Medium' | 'High';
  status: AlertStatus;
  reason: string;
  incident: string;
  audit: AuditItem[];
}
export interface WatchRule { id: number; name: string; icon: string; color: string; on: boolean; trigger: string; action: string; recipients: string }
export type RestrictionType = 'Restricted' | 'Watchlist' | 'Temporary Restriction';
export interface RegistryEntry {
  id: number;
  name: string;
  type: RestrictionType;
  reason: string;
  addedBy: string;
  addedOn: string;
  review: string;
  sites: string;
  status: 'Active' | 'Expiring Soon' | 'Removed';
  audit: AuditItem[];
}

export const ALERTS: ScreenAlert[] = [
  { id: 1, name: 'Arjun Mehta', match: 'Name similarity', conf: 92, source: 'Internal Watchlist', site: 'Main Campus – Tower A', detected: 'Today 10:18 AM', risk: 'Medium', status: 'Open', reason: 'Name similar to watchlist entry “Arjun Mehra”', incident: 'None on record',
    audit: [{ title: 'Alert created', at: 'Today, 10:18 AM', by: 'Screening system (Internal watchlist name similarity)' }] },
  { id: 2, name: 'Maria Santos', match: 'Document match', conf: 98, source: 'Restricted Visitors', site: 'Main Campus – Tower A', detected: 'Today 09:42 AM', risk: 'High', status: 'Under Review', reason: 'Restricted visitor record', incident: 'Access denied – 02 Sep 2026',
    audit: [
      { title: 'Alert created', at: 'Today, 09:42 AM', by: 'Screening system (Restricted visitor match)' },
      { title: 'Reception notified', at: 'Today, 09:43 AM', by: 'Front Desk Team' },
      { title: 'Security review assigned', at: 'Today, 09:45 AM', by: 'Security Admin' },
    ] },
  { id: 3, name: 'David Lee', match: 'No match', conf: 4, source: 'Screening Service', site: 'Plant Site – North Block', detected: 'Today 09:15 AM', risk: 'Low', status: 'Cleared', reason: 'No record found in external screening', incident: 'None on record',
    audit: [{ title: 'Alert created', at: 'Today, 09:15 AM', by: 'Screening Service' }, { title: 'Alert cleared', at: 'Today, 09:16 AM', by: 'Screening system (auto-clear < 10%)' }] },
  { id: 4, name: 'Sarah Khan', match: 'Name similarity', conf: 81, source: 'Internal Watchlist', site: 'Main Campus – Tower B', detected: 'Yesterday', risk: 'Medium', status: 'Cleared', reason: 'Name similar to watchlist entry “Sara Khan”', incident: 'None on record',
    audit: [{ title: 'Alert created', at: 'Yesterday, 04:12 PM', by: 'Screening system' }, { title: 'Alert cleared', at: 'Yesterday, 04:30 PM', by: 'Security Admin (different DOB)' }] },
];

export const RULES: WatchRule[] = [
  { id: 1, name: 'Internal Watchlist', icon: 'shield', color: '#7c3aed', on: true, trigger: 'Match with internal watchlist (name, document, or identifier)', action: 'Flag alert and require review', recipients: 'Security, Compliance' },
  { id: 2, name: 'Restricted Visitors', icon: 'admin-lock', color: '#dc2626', on: true, trigger: 'Match with restricted visitor record', action: 'Block access and require security review', recipients: 'Security, Front Desk, Compliance' },
  { id: 3, name: 'Expired Access', icon: 'clock', color: '#ea580c', on: true, trigger: 'Visitor with expired restriction or access period', action: 'Flag alert and deny access', recipients: 'Security, Front Desk' },
  { id: 4, name: 'Document Mismatch', icon: 'file-text', color: '#7c3aed', on: true, trigger: 'Document number mismatch or unverifiable document', action: 'Flag for manual verification', recipients: 'Security, Compliance' },
];

export const REGISTRY: RegistryEntry[] = [
  { id: 1, name: 'Maria Santos', type: 'Restricted', reason: 'Prior access violation', addedBy: 'Security Admin', addedOn: '02 Sep 2026', review: '02 Dec 2026', sites: 'All Sites', status: 'Active',
    audit: [{ title: 'Entry created', at: '02 Sep 2026, 11:05 AM', by: 'Security Admin' }, { title: 'Access denied at Tower A', at: '02 Sep 2026, 11:02 AM', by: 'Turnstile T-04' }] },
  { id: 2, name: 'Daniel Wong', type: 'Watchlist', reason: 'Unverified identity', addedBy: 'Compliance', addedOn: '12 Aug 2026', review: '12 Nov 2026', sites: 'Main Campus', status: 'Active',
    audit: [{ title: 'Entry created', at: '12 Aug 2026, 03:40 PM', by: 'Compliance' }] },
  { id: 3, name: 'Alex Brown', type: 'Temporary Restriction', reason: 'Badge misuse', addedBy: 'Security Admin', addedOn: '20 Sep 2026', review: '20 Oct 2026', sites: 'Plant Site', status: 'Expiring Soon',
    audit: [{ title: 'Entry created', at: '20 Sep 2026, 09:12 AM', by: 'Security Admin' }, { title: 'Badge VIS-000512 revoked', at: '20 Sep 2026, 09:14 AM', by: 'Security Admin' }] },
];

@Injectable({ providedIn: 'root' })
export class WatchStore {
  readonly alerts = signal<ScreenAlert[]>(structuredClone(ALERTS));
  readonly rules = signal<WatchRule[]>(structuredClone(RULES));
  readonly registry = signal<RegistryEntry[]>(structuredClone(REGISTRY));
  /** Baselines so the KPI tiles match the reference image with the seed rows above. */
  readonly activeWatchlist = computed(() => 39 + this.registry().filter((r) => r.status !== 'Removed').length);
  readonly openAlerts = computed(() => 6 + this.alerts().filter((a) => a.status === 'Open' || a.status === 'Under Review').length);
  readonly restricted = computed(() => 14 + this.registry().filter((r) => r.status !== 'Removed' && r.type !== 'Watchlist').length);
  readonly clearedToday = computed(() => 26 + this.alerts().filter((a) => a.status === 'Cleared' && a.detected.startsWith('Today')).length);
  isRestricted(name: string) { return this.registry().some((r) => r.name === name && r.status !== 'Removed' && r.type !== 'Watchlist'); }
}
