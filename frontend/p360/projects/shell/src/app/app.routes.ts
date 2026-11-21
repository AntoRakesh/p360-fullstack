import { Routes } from '@angular/router';
import * as accessVisitor from '@p360/access-visitor';
import * as ai from '@p360/ai';
import * as analyticsReports from '@p360/analytics-reports';
import * as automation from '@p360/automation';
import * as deviceLocation from '@p360/device-location';
import * as digitalTwin from '@p360/digital-twin';
import { licenseGuard, notLicensedPage } from '@p360/licensing';
import * as peopleIdentity from '@p360/people-identity';
import * as platformAdmin from '@p360/platform-admin';
import * as safetyOps from '@p360/safety-ops';
import { MODULES } from '@p360/shared/modules';
import { PageLoaders, ServiceDef } from '@p360/shared/service';
import * as workforceTime from '@p360/workforce-time';
import * as workplaceOps from '@p360/workplace-ops';

/** Every service library the shell hosts (services 1–11; Licensing is used through the guard). */
export const SERVICES: { SERVICE: ServiceDef; PAGES: PageLoaders }[] = [
  platformAdmin,
  peopleIdentity,
  workforceTime,
  accessVisitor,
  deviceLocation,
  safetyOps,
  workplaceOps,
  automation,
  analyticsReports,
  digitalTwin,
  ai,
];

/** Module path -> owning service. */
export const MODULE_SERVICE: Record<string, ServiceDef> = Object.fromEntries(
  SERVICES.flatMap(({ SERVICE }) => SERVICE.modules.map((m) => [m, SERVICE])),
);

/** All built pages, merged from every service. Missing keys show the placeholder page. */
const PAGES: PageLoaders = Object.assign({}, ...SERVICES.map((s) => s.PAGES));

const modulePage = () => import('./pages/module-page/module-page').then((c) => c.ModulePage);

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', loadComponent: () => import('./pages/auth/login').then((m) => m.Login) },
  { path: 'not-licensed', loadComponent: notLicensedPage },
  ...MODULES.flatMap((m): Routes =>
    m.children?.length
      ? [
          { path: m.path, pathMatch: 'full', redirectTo: `${m.path}/${m.children[0].path}` },
          ...m.children.map((c) => ({
            path: `${m.path}/${c.path}`,
            data: { module: m, sub: c, service: MODULE_SERVICE[m.path]?.key },
            canActivate: [licenseGuard],
            loadComponent: PAGES[`${m.path}/${c.path}`] ?? modulePage,
          })),
        ]
      : [
          {
            path: m.path,
            data: { module: m, service: MODULE_SERVICE[m.path]?.key },
            canActivate: [licenseGuard],
            loadComponent: modulePage,
          },
        ],
  ),
  { path: '**', redirectTo: 'command-center/enterprise-overview-dashboard' },
];
