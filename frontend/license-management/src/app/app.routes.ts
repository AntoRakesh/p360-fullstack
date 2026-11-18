import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login').then((m) => m.Login) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage) },
      { path: 'entitlements', loadComponent: () => import('./features/entitlements/entitlement-list').then((m) => m.EntitlementList) },
      { path: 'entitlements/new', loadComponent: () => import('./features/entitlements/entitlement-create').then((m) => m.EntitlementCreate) },
      { path: 'entitlements/:id', loadComponent: () => import('./features/entitlements/entitlement-detail').then((m) => m.EntitlementDetail) },
      { path: 'audit', loadComponent: () => import('./features/audit/audit-log').then((m) => m.AuditLog) },
    ],
  },
  { path: '**', redirectTo: '' },
];
