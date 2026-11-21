import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LicenseService } from './license.service';

/**
 * Blocks routes of modules the subscription does not cover. Route data must carry { module: { path } }.
 * UX only: the API gateway does the real check once the backend exists.
 */
export const licenseGuard: CanActivateFn = (route) => {
  const path = (route.data['module'] as { path?: string } | undefined)?.path;
  if (!path || inject(LicenseService).licensed(path)) return true;
  return inject(Router).createUrlTree(['/not-licensed'], { queryParams: { module: path } });
};
