// Workplace Ops service — frontend library.
// Owns the pages of these People360 modules. Backend calls go through the API gateway at /api/workplace-ops.
import { PageLoaders, ServiceDef } from '@p360/shared/service';

export const SERVICE: ServiceDef = {
  key: 'workplace-ops',
  title: 'Workplace Ops',
  gatewayPrefix: '/api/workplace-ops',
  modules: [
    'tasks-workforce-operations',
    'meal-canteen-management',
    'workplace-facility-services',
    'training-skills-compliance',
  ],
};

/** Pages built for this service. Key: "module-path/submodule-path". Missing keys show the placeholder page. */
export const PAGES: PageLoaders = {
  'meal-canteen-management/meal-plans-policies': () =>
    import('./meals/meal-plans').then((m) => m.MealPlans),
  'meal-canteen-management/menu-management': () =>
    import('./meals/meal-pages-a').then((m) => m.MenuManagement),
  'meal-canteen-management/canteen-locations': () =>
    import('./meals/meal-pages-a').then((m) => m.CanteenLocations),
  'meal-canteen-management/meal-booking-pre-order': () =>
    import('./meals/meal-pages-a').then((m) => m.MealBooking),
  'meal-canteen-management/meal-entitlement-wallet': () =>
    import('./meals/meal-pages-a').then((m) => m.MealWallet),
  'meal-canteen-management/subsidy-pricing': () =>
    import('./meals/meal-pages-b').then((m) => m.SubsidyPricing),
  'meal-canteen-management/allergen-nutritional-info': () =>
    import('./meals/meal-pages-b').then((m) => m.AllergenInfo),
  'meal-canteen-management/feedback-ratings': () =>
    import('./meals/meal-pages-b').then((m) => m.MealFeedback),
  'meal-canteen-management/reports-analytics': () =>
    import('./meals/meal-pages-b').then((m) => m.MealReports),
  'workplace-facility-services/desk-workspace-booking': () =>
    import('./workplace/desk-booking').then((m) => m.DeskBooking),
  'workplace-facility-services/meeting-room-booking': () =>
    import('./workplace/workplace-pages-a').then((m) => m.RoomBooking),
  'workplace-facility-services/parking-booking': () =>
    import('./workplace/workplace-pages-a').then((m) => m.ParkingBooking),
  'workplace-facility-services/facility-requests': () =>
    import('./workplace/workplace-pages-a').then((m) => m.FacilityRequests),
  'workplace-facility-services/asset-equipment-booking': () =>
    import('./workplace/workplace-pages-a').then((m) => m.AssetBooking),
  'workplace-facility-services/space-utilization': () =>
    import('./workplace/workplace-pages-a').then((m) => m.SpaceUtilization),
  'workplace-facility-services/housekeeping-cleaning': () =>
    import('./workplace/workplace-pages-b').then((m) => m.Housekeeping),
  'workplace-facility-services/maintenance-requests': () =>
    import('./workplace/workplace-pages-b').then((m) => m.MaintenanceRequests),
  'workplace-facility-services/service-catalog': () =>
    import('./workplace/workplace-pages-b').then((m) => m.ServiceCatalog),
  'workplace-facility-services/approvals-sla': () =>
    import('./workplace/workplace-pages-b').then((m) => m.ApprovalsSla),
  'workplace-facility-services/reports-analytics': () =>
    import('./workplace/workplace-pages-b').then((m) => m.WorkplaceReports),
  'tasks-workforce-operations/task-master-templates': () =>
    import('./tasks/task-master-templates').then((m) => m.TaskMasterTemplates),
  'tasks-workforce-operations/task-assignment-scheduling': () =>
    import('./tasks/tasks-pages-a').then((m) => m.TaskAssignmentScheduling),
  'tasks-workforce-operations/daily-task-execution': () =>
    import('./tasks/tasks-pages-a').then((m) => m.DailyTaskExecution),
  'tasks-workforce-operations/mobile-task-app': () =>
    import('./tasks/tasks-pages-a').then((m) => m.MobileTaskApp),
  'tasks-workforce-operations/checkpoint-location-tasks': () =>
    import('./tasks/tasks-pages-a').then((m) => m.CheckpointLocationTasks),
  'tasks-workforce-operations/sla-escalations': () =>
    import('./tasks/tasks-pages-b').then((m) => m.SLAEscalations),
  'tasks-workforce-operations/task-verification-approvals': () =>
    import('./tasks/tasks-pages-b').then((m) => m.TaskVerificationApprovals),
  'tasks-workforce-operations/productivity-performance': () =>
    import('./tasks/tasks-pages-b').then((m) => m.ProductivityPerformance),
  'tasks-workforce-operations/reports-analytics': () =>
    import('./tasks/tasks-pages-b').then((m) => m.TasksReportsAnalytics),
  'training-skills-compliance/skills-competency-matrix': () =>
    import('./training/skills-competency-matrix').then((m) => m.SkillsCompetencyMatrix),
  'training-skills-compliance/training-catalog': () =>
    import('./training/training-pages-a').then((m) => m.TrainingCatalog),
  'training-skills-compliance/training-plan-enrollment': () =>
    import('./training/training-pages-a').then((m) => m.TrainingPlanEnrollment),
  'training-skills-compliance/learning-paths': () =>
    import('./training/training-pages-a').then((m) => m.LearningPaths),
  'training-skills-compliance/certifications-licenses': () =>
    import('./training/training-pages-a').then((m) => m.CertificationsLicenses),
  'training-skills-compliance/compliance-tracking': () =>
    import('./training/training-pages-b').then((m) => m.ComplianceTracking),
  'training-skills-compliance/assessments-evaluations': () =>
    import('./training/training-pages-b').then((m) => m.AssessmentsEvaluations),
  'training-skills-compliance/renewals-expiry-alerts': () =>
    import('./training/training-pages-b').then((m) => m.RenewalsExpiryAlerts),
  'training-skills-compliance/reports-analytics': () =>
    import('./training/training-pages-b').then((m) => m.TrnReportsAnalytics),
};
