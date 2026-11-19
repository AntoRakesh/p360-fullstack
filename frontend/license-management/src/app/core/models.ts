// Mirrors backend/license-management-backend/docs/API.md — keep in sync.

export type Product = 'People360' | 'Asset360' | 'Environment360';
export type EntitlementState = 'Live' | 'Suspended' | 'Revoked' | 'Expired' | 'Superseded';
export type Tier = 'Essential' | 'Professional' | 'Enterprise';
export type HostingMode = 'Cloud' | 'OnPrem' | 'Split';
export type Inclusion = 'Included' | 'AddOn' | 'None';

export const PRODUCTS: Product[] = ['People360', 'Asset360', 'Environment360'];
export const STATES: EntitlementState[] = ['Live', 'Suspended', 'Revoked', 'Expired', 'Superseded'];
export const TIERS: Tier[] = ['Essential', 'Professional', 'Enterprise'];
export const HOSTING_MODES: HostingMode[] = ['Cloud', 'OnPrem', 'Split'];

export interface ModuleGrant {
  moduleKey: string;
  moduleValidUntil?: string | null;
  deviceKinds?: string[] | null;
}

/** Quantity null = unlimited. */
export interface CapacityGrant {
  quantity: number | null;
}

/** Registered / Connected capacity. A missing grant = not purchased. */
export interface Capacity {
  registered?: CapacityGrant | null;
  connected?: CapacityGrant | null;
}

export interface CapacityOptions {
  /** null = product has no Registered capacity (Environment360). A null item = Unlimited. */
  registered: (number | null)[] | null;
  connected: number[];
  /** Connected alone adds Registered at this quantity; null = never. */
  autoRegistered: number | null;
}

export interface Entitlement {
  id: string;
  /** Old rows without a product are People360. */
  product: Product;
  subscriberCode: string;
  customerName: string;
  contactEmail: string;
  revision: number;
  state: EntitlementState;
  tier: Tier;
  modules: ModuleGrant[];
  capacity: Capacity;
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
  /** Masked (password hidden). Full value via ApiService.revealClientDb. */
  clientDbConnection?: string | null;
}

export interface EntitlementInput {
  product: Product;
  subscriberCode?: string | null;
  customerName: string;
  contactEmail: string;
  tier: Tier;
  modules: ModuleGrant[];
  capacity: Capacity;
  validFrom: string;
  validUntil: string;
  minBuild?: string | null;
  maxBuild?: string | null;
  hostingMode: HostingMode;
  hostFingerprint?: string | null;
  notes?: string | null;
  clientDbConnectionString?: string | null;
}

export interface RenewInput {
  validUntil: string;
  tier?: Tier;
  modules?: ModuleGrant[];
  capacity?: Capacity;
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
}

/** One product's modules, tiers and Registered / Connected options. */
export interface Catalog {
  product: Product;
  title: string;
  modules: CatalogModule[];
  tiers: TierDef[];
  capacity: CapacityOptions;
}

export interface CatalogResponse {
  products: Catalog[];
}

export interface Dashboard {
  byState: Partial<Record<EntitlementState, number>>;
  byTier: Partial<Record<Tier, number>>;
  byProduct?: Partial<Record<Product, number>>;
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
  product?: Product | null;
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
  product?: Product | '';
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
