// Mirrors backend/license-management-backend/docs/API.md — keep in sync.

export type EntitlementState = 'Live' | 'Suspended' | 'Revoked' | 'Expired' | 'Superseded';
export type Tier = 'Essential' | 'Professional' | 'Enterprise';
export type HostingMode = 'Cloud' | 'OnPrem' | 'Split';
export type Inclusion = 'Included' | 'AddOn' | 'None';
export type AnalyticsLevel = 'Basic' | 'Full';
export type ApiAccess = 'Limited' | 'Full';

export const STATES: EntitlementState[] = ['Live', 'Suspended', 'Revoked', 'Expired', 'Superseded'];
export const TIERS: Tier[] = ['Essential', 'Professional', 'Enterprise'];
export const HOSTING_MODES: HostingMode[] = ['Cloud', 'OnPrem', 'Split'];

export interface ModuleGrant {
  moduleKey: string;
  seatLimit?: number | null;
  moduleValidUntil?: string | null;
  deviceKinds?: string[] | null;
}

export interface Features {
  analyticsLevel: AnalyticsLevel;
  apiAccess: ApiAccess;
  apiDailyCallLimit?: number | null;
  apiReadOnly: boolean;
  maxSites?: number | null;
}

export interface Entitlement {
  id: string;
  subscriberCode: string;
  customerName: string;
  contactEmail: string;
  revision: number;
  state: EntitlementState;
  tier: Tier;
  modules: ModuleGrant[];
  features: Features;
  seatLimit: number;
  deviceLimit?: number | null;
  validFrom: string;
  validUntil: string;
  minBuild?: string | null;
  maxBuild?: string | null;
  hostingMode: HostingMode;
  hostFingerprint?: string | null;
  issuedAt: string;
  issuedBy: string;
  lastPingAt?: string | null;
  lastCheckinAt?: string | null;
  installKeyPrefix?: string | null;
  notes?: string | null;
  stateReason?: string | null;
}

export interface EntitlementInput {
  subscriberCode?: string | null;
  customerName: string;
  contactEmail: string;
  tier: Tier;
  modules: ModuleGrant[];
  features: Features;
  seatLimit: number;
  deviceLimit?: number | null;
  validFrom: string;
  validUntil: string;
  minBuild?: string | null;
  maxBuild?: string | null;
  hostingMode: HostingMode;
  hostFingerprint?: string | null;
  notes?: string | null;
}

export interface RenewInput {
  validUntil: string;
  tier?: Tier;
  modules?: ModuleGrant[];
  features?: Features;
  seatLimit?: number;
  deviceLimit?: number | null;
  hostFingerprint?: string | null;
  notes?: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditEvent {
  id: string;
  who: string;
  action: string;
  entitlementId?: string | null;
  subscriberCode?: string | null;
  before?: unknown;
  after?: unknown;
  at: string;
  ip?: string | null;
}

export interface CatalogModule {
  key: string;
  title: string;
  group: string;
  core: boolean;
}

export interface TierDef {
  tier: Tier;
  title: string;
  inclusion: Record<string, Inclusion>;
  features: Features;
}

export interface Catalog {
  modules: CatalogModule[];
  tiers: TierDef[];
}

export interface Dashboard {
  byState: Partial<Record<EntitlementState, number>>;
  byTier: Partial<Record<Tier, number>>;
  expiringSoon: Entitlement[];
  recentAudit: AuditEvent[];
}

export interface LoginResponse {
  mfaToken: string;
  enrollRequired: boolean;
  otpauthUri?: string;
  secret?: string;
}

export interface AdminUser {
  username: string;
  roles: string[];
}

export interface MfaResponse {
  accessToken: string;
  expiresAt: string;
  user: AdminUser;
}

export interface ActivationInfo {
  subscriberCode?: string | null;
  hostFingerprint: string;
  productBuild: string;
  hostname: string;
  requestedAt: string;
}

export interface InstallKey {
  apiKey: string;
  keyPrefix: string;
}

export interface EntitlementQuery {
  search?: string;
  state?: EntitlementState | '';
  tier?: Tier | '';
  hostingMode?: HostingMode | '';
  page?: number;
  pageSize?: number;
}

export interface AuditQuery {
  subscriberCode?: string;
  action?: string;
  page?: number;
  pageSize?: number;
}
