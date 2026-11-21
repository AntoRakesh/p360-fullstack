import { Injectable, effect, signal } from '@angular/core';

/** Plans the tenant can buy (demo pricing). */
export const PLANS = [
  {
    id: 'Professional',
    price: 9,
    seats: 500,
    modules: 14,
    features: [
      'Core people & attendance',
      'Access & visitors',
      'Standard reports',
      'Email support',
    ],
  },
  {
    id: 'Enterprise',
    price: 14,
    seats: 1500,
    modules: 22,
    features: [
      'Everything in Professional',
      'Multi-site & business units',
      'SSO, RBAC & audit',
      'Workflow & integrations',
      '24×7 priority support',
    ],
  },
  {
    id: 'Enterprise Plus',
    price: 19,
    seats: 5000,
    modules: 26,
    features: [
      'Everything in Enterprise',
      'RTLS, Digital Twin & AI',
      'Sub-tenants',
      'Dedicated CSM & 99.95% SLA',
      'Data residency choice',
    ],
  },
];

/** Modules that need a paid add-on (or Enterprise Plus). Everything else comes with the plan. */
export const ADDON_MODULES = [
  'real-time-location',
  'digital-twin',
  'ai-people-intelligence',
  'device-edge-management',
];

export interface Subscription {
  plan: string;
  term: string;
  start: string;
  renewal: string;
  seats: number;
  price: number;
  addons: string[];
  autoRenew: boolean;
  billingEmail: string;
  po: string;
}

const DEFAULT: Subscription = {
  plan: 'Enterprise',
  term: 'Annual',
  start: '2026-01-01',
  renewal: '2026-12-31',
  seats: 1500,
  price: 14,
  addons: ['real-time-location', 'ai-people-intelligence'],
  autoRenew: true,
  billingEmail: 'finance@dcs.ae',
  po: 'PO-DCS-2026-118',
};

const KEY = 'p360.license';

function load(): Subscription {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as Partial<Subscription>) };
  } catch {
    /* storage blocked or corrupt */
  }
  return { ...DEFAULT, addons: [...DEFAULT.addons] };
}

/**
 * Client of the Licensing & Billing service (service 12).
 * Hardcoded for now: the subscription lives in the browser (localStorage).
 * Later: load it from GET /api/licensing/subscription through the API gateway.
 */
@Injectable({ providedIn: 'root' })
export class LicenseService {
  readonly subscription = signal<Subscription>(load());

  constructor() {
    effect(() => {
      const s = this.subscription();
      try {
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        /* storage blocked: lives in memory only */
      }
    });
  }

  /** Is this module (path from modules.ts) covered by the current subscription? */
  licensed(path: string): boolean {
    const s = this.subscription();
    return !ADDON_MODULES.includes(path) || s.addons.includes(path) || s.plan === 'Enterprise Plus';
  }

  /** Restore the demo subscription. */
  reset(): void {
    this.subscription.set({ ...DEFAULT, addons: [...DEFAULT.addons] });
  }
}
