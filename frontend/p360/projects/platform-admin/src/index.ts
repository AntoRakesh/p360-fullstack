// Platform & Admin service — frontend library.
// Owns the pages of these People360 modules. Backend calls go through the API gateway at /api/platform-admin.
import { PageLoaders, ServiceDef } from '@p360/shared/service';

export const SERVICE: ServiceDef = {
  key: 'platform-admin',
  title: 'Platform & Admin',
  gatewayPrefix: '/api/platform-admin',
  modules: ['administration-configuration'],
};

/** Pages built for this service. Key: "module-path/submodule-path". Missing keys show the placeholder page. */
export const PAGES: PageLoaders = {
  'administration-configuration/organization-tenant-setup': () =>
    import('./admin/organization-tenant-setup').then((m) => m.OrganizationTenantSetup),
  'administration-configuration/sites-locations': () =>
    import('./admin/admin-pages-a').then((m) => m.SitesLocations),
  'administration-configuration/departments-teams': () =>
    import('./admin/admin-pages-a').then((m) => m.DepartmentsTeams),
  'administration-configuration/roles-permissions': () =>
    import('./admin/admin-pages-a').then((m) => m.RolesPermissions),
  'administration-configuration/user-group-management': () =>
    import('./admin/admin-pages-a').then((m) => m.UserGroupManagement),
  'administration-configuration/module-access': () =>
    import('./admin/admin-pages-a').then((m) => m.ModuleAccess),
  'administration-configuration/system-settings': () =>
    import('./admin/admin-pages-b').then((m) => m.SystemSettings),
  'administration-configuration/audit-logs': () =>
    import('./admin/admin-pages-b').then((m) => m.AuditLogs),
  'administration-configuration/data-privacy': () =>
    import('./admin/admin-pages-b').then((m) => m.DataPrivacy),
  'administration-configuration/branding-localization': () =>
    import('./admin/admin-pages-b').then((m) => m.BrandingLocalization),
  'administration-configuration/subscription-licensing': () =>
    import('./admin/admin-pages-b').then((m) => m.SubscriptionLicensing),
};
