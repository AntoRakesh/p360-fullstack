// Safety Ops service — frontend library.
// Owns the pages of these People360 modules. Backend calls go through the API gateway at /api/safety-ops.
import { PageLoaders, ServiceDef } from '@p360/shared/service';

export const SERVICE: ServiceDef = {
  key: 'safety-ops',
  title: 'Safety Ops',
  gatewayPrefix: '/api/safety-ops',
  modules: ['emergency-mustering', 'safety-wellbeing', 'patrol-guard-management'],
};

/** Pages built for this service. Key: "module-path/submodule-path". Missing keys show the placeholder page. */
export const PAGES: PageLoaders = {
  'emergency-mustering/emergency-command-center': () =>
    import('./emergency/command-center').then((m) => m.EmergencyCommandCenter),
  'emergency-mustering/active-evacuations': () =>
    import('./emergency/emergency-pages-a').then((m) => m.ActiveEvacuations),
  'emergency-mustering/muster-points': () =>
    import('./emergency/emergency-pages-a').then((m) => m.MusterPoints),
  'emergency-mustering/accountability': () =>
    import('./emergency/emergency-pages-a').then((m) => m.Accountability),
  'emergency-mustering/missing-persons': () =>
    import('./emergency/emergency-pages-a').then((m) => m.MissingPersons),
  'emergency-mustering/zones-areas': () =>
    import('./emergency/emergency-pages-a').then((m) => m.EmergencyZones),
  'emergency-mustering/wardens-teams': () =>
    import('./emergency/emergency-pages-a').then((m) => m.WardensTeams),
  'emergency-mustering/events-drills': () =>
    import('./emergency/emergency-pages-b').then((m) => m.EventsDrills),
  'emergency-mustering/notifications': () =>
    import('./emergency/emergency-pages-b').then((m) => m.EmergencyNotifications),
  'emergency-mustering/incidents-reports': () =>
    import('./emergency/emergency-pages-b').then((m) => m.EmergencyReports),
  'emergency-mustering/emergency-devices': () =>
    import('./emergency/emergency-pages-b').then((m) => m.EmergencyDevices),
  'emergency-mustering/configuration-masters': () =>
    import('./emergency/emergency-pages-b').then((m) => m.EmergencyConfig),
  'safety-wellbeing/safety-command-center': () =>
    import('./safety/command-center').then((m) => m.SafetyCommandCenter),
  'safety-wellbeing/incident-management': () =>
    import('./safety/safety-pages-a').then((m) => m.IncidentManagement),
  'safety-wellbeing/hazard-risk-management': () =>
    import('./safety/safety-pages-a').then((m) => m.HazardRisk),
  'safety-wellbeing/safety-inspections': () =>
    import('./safety/safety-pages-a').then((m) => m.SafetyInspections),
  'safety-wellbeing/permits-work-authorizations': () =>
    import('./safety/safety-pages-a').then((m) => m.SafetyPermits),
  'safety-wellbeing/toolbox-talks-training': () =>
    import('./safety/safety-pages-a').then((m) => m.ToolboxTalks),
  'safety-wellbeing/ppe-compliance': () =>
    import('./safety/safety-pages-b').then((m) => m.PpeCompliance),
  'safety-wellbeing/safety-observations-near-miss': () =>
    import('./safety/safety-pages-b').then((m) => m.SafetyObservations),
  'safety-wellbeing/health-wellbeing': () =>
    import('./safety/safety-pages-b').then((m) => m.HealthWellbeing),
  'safety-wellbeing/reports-analytics': () =>
    import('./safety/safety-pages-b').then((m) => m.SafetyReports),
  'patrol-guard-management/guard-directory': () =>
    import('./patrol/guard-directory').then((m) => m.GuardDirectory),
  'patrol-guard-management/guard-shifts-rosters': () =>
    import('./patrol/patrol-pages-a').then((m) => m.GuardShifts),
  'patrol-guard-management/patrol-routes-checkpoints': () =>
    import('./patrol/patrol-pages-a').then((m) => m.PatrolRoutes),
  'patrol-guard-management/live-patrol-monitoring': () =>
    import('./patrol/patrol-pages-a').then((m) => m.LivePatrol),
  'patrol-guard-management/incidents-reports': () =>
    import('./patrol/patrol-pages-a').then((m) => m.PatrolIncidents),
  'patrol-guard-management/guard-performance': () =>
    import('./patrol/patrol-pages-a').then((m) => m.GuardPerformance),
  'patrol-guard-management/training-certifications': () =>
    import('./patrol/patrol-pages-b').then((m) => m.GuardTraining),
  'patrol-guard-management/equipment-assets': () =>
    import('./patrol/patrol-pages-b').then((m) => m.GuardEquipment),
  'patrol-guard-management/permits-access': () =>
    import('./patrol/patrol-pages-b').then((m) => m.GuardPermits),
  'patrol-guard-management/contractor-guards': () =>
    import('./patrol/patrol-pages-b').then((m) => m.ContractorGuards),
  'patrol-guard-management/settings-configuration': () =>
    import('./patrol/patrol-pages-b').then((m) => m.PatrolSettings),
};
