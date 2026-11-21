// Analytics & Reports service — frontend library.
// Owns the pages of these People360 modules. Backend calls go through the API gateway at /api/analytics-reports.
import { PageLoaders, ServiceDef } from '@p360/shared/service';

export const SERVICE: ServiceDef = {
  key: 'analytics-reports',
  title: 'Analytics & Reports',
  gatewayPrefix: '/api/analytics-reports',
  modules: ['command-center', 'reports-analytics', 'customer-visitor-analytics'],
};

/** Pages built for this service. Key: "module-path/submodule-path". Missing keys show the placeholder page. */
export const PAGES: PageLoaders = {
  'command-center/enterprise-overview-dashboard': () =>
    import('./command-center/command-center').then((m) => m.CommandCenter),
  'command-center/people-presence-dashboard': () =>
    import('./dashboards/people-presence').then((m) => m.PeoplePresence),
  'command-center/attendance-dashboard': () =>
    import('./dashboards/attendance').then((m) => m.AttendanceDashboard),
  'command-center/access-security-dashboard': () =>
    import('./dashboards/access-security').then((m) => m.AccessSecurity),
  'command-center/visitor-contractor-dashboard': () =>
    import('./dashboards/visitor-contractor').then((m) => m.VisitorContractor),
  'command-center/emergency-safety-dashboard': () =>
    import('./dashboards/emergency-safety').then((m) => m.EmergencySafety),
  'command-center/workforce-productivity': () =>
    import('./dashboards/workforce-productivity').then((m) => m.WorkforceProductivity),
  'command-center/multi-site-operations': () =>
    import('./dashboards/multi-site').then((m) => m.MultiSite),
  'command-center/ai-insights-recommendations': () =>
    import('./dashboards/ai-insights').then((m) => m.AiInsights),
  'command-center/custom-dashboard-builder': () =>
    import('./dashboards/dashboard-builder').then((m) => m.DashboardBuilder),
  'command-center/executive-kpi-scorecards': () =>
    import('./dashboards/kpi-scorecards').then((m) => m.KpiScorecards),
  'command-center/alerts-action-center': () =>
    import('./dashboards/alerts-center').then((m) => m.AlertsCenter),
  'customer-visitor-analytics/footfall-people-counting': () =>
    import('./analytics/footfall').then((m) => m.Footfall),
  'customer-visitor-analytics/dwell-time-movement': () =>
    import('./analytics/analytics-pages-a').then((m) => m.DwellTime),
  'customer-visitor-analytics/zone-area-analytics': () =>
    import('./analytics/analytics-pages-a').then((m) => m.ZoneAnalytics),
  'customer-visitor-analytics/demographics-ai': () =>
    import('./analytics/analytics-pages-a').then((m) => m.Demographics),
  'customer-visitor-analytics/repeat-vs-new-visitors': () =>
    import('./analytics/analytics-pages-a').then((m) => m.RepeatVisitors),
  'customer-visitor-analytics/heatmaps-trajectories': () =>
    import('./analytics/analytics-pages-a').then((m) => m.AnalyticsHeatmaps),
  'customer-visitor-analytics/queue-management': () =>
    import('./analytics/analytics-pages-b').then((m) => m.QueueManagement),
  'customer-visitor-analytics/conversion-engagement': () =>
    import('./analytics/analytics-pages-b').then((m) => m.Conversion),
  'customer-visitor-analytics/reports-insights': () =>
    import('./analytics/analytics-pages-b').then((m) => m.AnalyticsReports),
  'customer-visitor-analytics/device-management': () =>
    import('./analytics/analytics-pages-b').then((m) => m.AnalyticsDevices),
  'reports-analytics/report-library': () =>
    import('./reports/report-library').then((m) => m.ReportLibrary),
  'reports-analytics/standard-reports': () =>
    import('./reports/reports-pages-a').then((m) => m.StandardReports),
  'reports-analytics/custom-report-builder': () =>
    import('./reports/reports-pages-a').then((m) => m.CustomReportBuilder),
  'reports-analytics/scheduled-reports': () =>
    import('./reports/reports-pages-a').then((m) => m.ScheduledReports),
  'reports-analytics/dashboards': () =>
    import('./reports/reports-pages-a').then((m) => m.RptDashboards),
  'reports-analytics/data-export': () =>
    import('./reports/reports-pages-b').then((m) => m.DataExport),
  'reports-analytics/report-sharing-access': () =>
    import('./reports/reports-pages-b').then((m) => m.ReportSharingAccess),
  'reports-analytics/report-audit-trail': () =>
    import('./reports/reports-pages-b').then((m) => m.ReportAuditTrail),
};
