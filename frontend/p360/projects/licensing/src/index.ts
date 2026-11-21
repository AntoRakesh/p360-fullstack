// Licensing & Billing service (service 12) — frontend library.
// Client for plans, add-ons, seats and module access. Backend calls will go through the API gateway at /api/licensing.
// Unlike other service libraries, any library may import this one (every module needs to know what is licensed).
import { ServiceDef } from '@p360/shared/service';

export const SERVICE: ServiceDef = {
  key: 'licensing',
  title: 'Licensing & Billing',
  gatewayPrefix: '/api/licensing',
  modules: [],
};

export { ADDON_MODULES, LicenseService, PLANS } from './license.service';
export type { Subscription } from './license.service';
export { licenseGuard } from './license.guard';
export const notLicensedPage = () => import('./not-licensed').then((m) => m.NotLicensed);
