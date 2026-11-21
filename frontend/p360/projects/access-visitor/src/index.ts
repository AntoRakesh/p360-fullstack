// Access & Visitor service — frontend library.
// Owns the pages of these People360 modules. Backend calls go through the API gateway at /api/access-visitor.
import { PageLoaders, ServiceDef } from '@p360/shared/service';

export const SERVICE: ServiceDef = {
  key: 'access-visitor',
  title: 'Access & Visitor',
  gatewayPrefix: '/api/access-visitor',
  modules: ['physical-access-control', 'visitor-management'],
};

/** Pages built for this service. Key: "module-path/submodule-path". Missing keys show the placeholder page. */
export const PAGES: PageLoaders = {
  'physical-access-control/live-access-events': () =>
    import('./access/live-access').then((m) => m.LiveAccess),
  'physical-access-control/door-monitoring': () =>
    import('./access/doors-logs-schedules').then((m) => m.DoorMonitoring),
  'physical-access-control/access-logs': () =>
    import('./access/doors-logs-schedules').then((m) => m.AccessLogs),
  'physical-access-control/access-control-schedules': () =>
    import('./access/doors-logs-schedules').then((m) => m.AccessSchedules),
  'physical-access-control/access-levels-permissions': () =>
    import('./access/levels-credentials-visitors').then((m) => m.AccessLevels),
  'physical-access-control/credential-management': () =>
    import('./access/levels-credentials-visitors').then((m) => m.CredentialMgmt),
  'physical-access-control/visitor-access-integration': () =>
    import('./access/levels-credentials-visitors').then((m) => m.VisitorAccess),
  'physical-access-control/anti-passback-security-rules': () =>
    import('./access/rules-alarms-reports').then((m) => m.SecurityRules),
  'physical-access-control/door-alarms-tamper-events': () =>
    import('./access/rules-alarms-reports').then((m) => m.DoorAlarms),
  'physical-access-control/access-reports-analytics': () =>
    import('./access/rules-alarms-reports').then((m) => m.AccessReports),
  'visitor-management/visitor-dashboard': () =>
    import('./visitors/visitor-dashboard').then((m) => m.VisitorDashboard),
  'visitor-management/find-your-visit': () =>
    import('./visitors/vm-find-visit').then((m) => m.FindYourVisit),
  'visitor-management/pre-registration': () =>
    import('./visitors/vm-pre-registration').then((m) => m.PreRegistration),
  'visitor-management/walk-in-registration': () =>
    import('./visitors/vm-walk-in').then((m) => m.WalkInRegistration),
  'visitor-management/visit-invitations': () =>
    import('./visitors/vm-invitations').then((m) => m.VisitInvitations),
  'visitor-management/qr-invitations-digital-passes': () =>
    import('./visitors/vm-qr-passes').then((m) => m.QrDigitalPasses),
  'visitor-management/visit-scheduling': () =>
    import('./visitors/vm-scheduling').then((m) => m.VisitScheduling),
  'visitor-management/group-vip-visits': () =>
    import('./visitors/vm-group-vip').then((m) => m.GroupVipVisits),
  'visitor-management/visitor-approvals': () =>
    import('./visitors/vm-approvals').then((m) => m.VisitorApprovals),
  'visitor-management/id-verification': () =>
    import('./visitors/vm-id-verification').then((m) => m.IdVerification),
  'visitor-management/visitor-check-in-check-out': () =>
    import('./visitors/vm-check-in-out').then((m) => m.CheckInOut),
  'visitor-management/visitor-passes-badges': () =>
    import('./visitors/vm-badges').then((m) => m.BadgesPrinting),
  'visitor-management/deliveries-pickups': () =>
    import('./visitors/vm-deliveries').then((m) => m.DeliveriesPickups),
  'visitor-management/host-notifications': () =>
    import('./visitors/vm-host-notifications').then((m) => m.HostNotifications),
  'visitor-management/visitor-location-escort': () =>
    import('./visitors/vm-location-escort').then((m) => m.LocationEscort),
  'visitor-management/emergency-visitor-accountability': () =>
    import('./visitors/vm-emergency').then((m) => m.EmergencyAccountability),
  'visitor-management/watchlist-blacklist': () =>
    import('./visitors/vm-watchlist').then((m) => m.WatchlistRestricted),
  'visitor-management/visitor-analytics-reports': () =>
    import('./visitors/vm-analytics').then((m) => m.VisitorAnalytics),
  'visitor-management/visitor-logs-history': () =>
    import('./visitors/checkin-passes-logs').then((m) => m.VisitorLogs),
  'visitor-management/host-management': () =>
    import('./visitors/hosts-categories-vehicles').then((m) => m.HostManagement),
  'visitor-management/visitor-categories-rules': () =>
    import('./visitors/hosts-categories-vehicles').then((m) => m.VisitorCategories),
  'visitor-management/vehicle-management': () =>
    import('./visitors/hosts-categories-vehicles').then((m) => m.VehicleMgmt),
};
