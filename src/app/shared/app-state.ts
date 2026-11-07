import { Injectable, computed, signal } from '@angular/core';

export interface Site {
  name: string;
  /** Share of enterprise headcount, used to scale demo numbers. */
  factor: number;
}

export const SITES: Site[] = [
  { name: 'All Sites', factor: 1 },
  { name: 'Head Office', factor: 0.34 },
  { name: 'Manufacturing', factor: 0.29 },
  { name: 'Warehouse', factor: 0.19 },
  { name: 'Logistics Hub', factor: 0.1 },
  { name: 'Retail Stores', factor: 0.06 },
  { name: 'Data Center', factor: 0.02 },
];

export interface AppNotification {
  id: number;
  title: string;
  text: string;
  time: string;
  icon: string;
  color: string;
  read: boolean;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Global UI state shared by the top bar and pages (demo only, in memory). */
@Injectable({ providedIn: 'root' })
export class AppState {
  readonly sites = SITES;
  readonly site = signal<Site>(SITES[0]);
  readonly date = signal(new Date());
  readonly liveEnabled = signal(true);
  /** Live only makes sense when viewing today. */
  readonly isToday = computed(() => sameDay(this.date(), new Date()));
  readonly live = computed(() => this.liveEnabled() && this.isToday());
  /** Increments every 2.5s while live; pages use it to simulate movement. */
  readonly tick = signal(0);
  /** Site share x day variation; multiply demo counts by this. */
  readonly factor = computed(() => {
    const d = this.date();
    const day = this.isToday() ? 1 : 0.82 + ((d.getDate() * 37 + d.getMonth() * 11) % 20) / 100;
    return this.site().factor * day;
  });

  constructor() {
    setInterval(() => this.live() && this.tick.update((t) => t + 1), 2500);
  }

  /** Scale a demo count to the selected site/day. */
  scale(n: number) {
    return Math.round(n * this.factor());
  }

  /** Small deterministic wobble for live numbers. */
  wobble(key: string, amp: number) {
    const t = this.tick();
    if (!t) return 0;
    const h = [...key].reduce((x, c) => (x * 31 + c.charCodeAt(0)) | 0, 7);
    return Math.round(Math.sin(t / 2 + h) * amp);
  }

  readonly notifications = signal<AppNotification[]>([
    { id: 1, title: 'Restricted Zone Alert', text: 'Unidentified person in Server Room - Floor 1', time: '10:21 AM', icon: 'triangle-alert', color: '#ef4444', read: false },
    { id: 2, title: 'Panic Alert (Wearable)', text: 'Ali Hassan · Warehouse - Zone B', time: '10:16 AM', icon: 'shield', color: '#ef4444', read: false },
    { id: 3, title: 'Visitor waiting', text: 'Ahmed Al Mansoori at Reception - Head Office', time: '10:12 AM', icon: 'user-plus', color: '#3b82f6', read: false },
    { id: 4, title: 'Permit expiring', text: '3 contractor work permits expire today', time: '09:40 AM', icon: 'key-round', color: '#f97316', read: false },
    { id: 5, title: 'Firmware update ready', text: '12 access readers can be updated', time: '08:05 AM', icon: 'download', color: '#8b5cf6', read: true },
  ]);
  /** Badge count: unread in this list plus older unread items not shown. */
  readonly unread = computed(() => {
    const n = this.notifications().filter((x) => !x.read).length;
    return n ? n + 8 : 0;
  });

  markAllRead() {
    this.notifications.update((list) => list.map((n) => ({ ...n, read: true })));
  }

  setDate(value: string) {
    if (!value) return;
    const [y, m, d] = value.split('-').map(Number);
    this.date.set(new Date(y, m - 1, d));
  }
}
