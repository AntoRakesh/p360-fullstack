// Workforce Time service — frontend library.
// Owns the pages of these People360 modules. Backend calls go through the API gateway at /api/workforce-time.
import { PageLoaders, ServiceDef } from '@p360/shared/service';

export const SERVICE: ServiceDef = {
  key: 'workforce-time',
  title: 'Workforce Time',
  gatewayPrefix: '/api/workforce-time',
  modules: ['time-attendance', 'shift-workforce', 'leave-absence'],
};

/** Pages built for this service. Key: "module-path/submodule-path". Missing keys show the placeholder page. */
export const PAGES: PageLoaders = {
  'time-attendance/live-attendance-monitor': () =>
    import('./attendance/live-monitor').then((m) => m.LiveMonitor),
  'time-attendance/attendance-transactions': () =>
    import('./attendance/transactions-timesheets').then((m) => m.AttendanceTransactions),
  'time-attendance/daily-monthly-timesheets': () =>
    import('./attendance/transactions-timesheets').then((m) => m.Timesheets),
  'time-attendance/attendance-policies': () =>
    import('./attendance/policies-overtime').then((m) => m.AttendancePolicies),
  'time-attendance/break-overtime-management': () =>
    import('./attendance/policies-overtime').then((m) => m.BreakOvertime),
  'time-attendance/attendance-regularization': () =>
    import('./attendance/regularization-exceptions-reports').then((m) => m.Regularization),
  'time-attendance/absence-exception-management': () =>
    import('./attendance/regularization-exceptions-reports').then((m) => m.AbsenceExceptions),
  'time-attendance/attendance-reports-analytics': () =>
    import('./attendance/regularization-exceptions-reports').then((m) => m.AttendanceReports),
  'shift-workforce/shift-master': () =>
    import('./scheduling/shift-master').then((m) => m.ShiftMaster),
  'shift-workforce/shift-templates-rotations': () =>
    import('./scheduling/templates-roster').then((m) => m.ShiftTemplates),
  'shift-workforce/roster-planning': () =>
    import('./scheduling/templates-roster').then((m) => m.RosterPlanning),
  'shift-workforce/schedule-approvals': () =>
    import('./scheduling/templates-roster').then((m) => m.ScheduleApprovals),
  'shift-workforce/employee-shift-assignment': () =>
    import('./scheduling/assignment-swap-ot').then((m) => m.ShiftAssignment),
  'shift-workforce/shift-swap-requests': () =>
    import('./scheduling/assignment-swap-ot').then((m) => m.ShiftSwap),
  'shift-workforce/overtime-scheduling': () =>
    import('./scheduling/assignment-swap-ot').then((m) => m.OvertimeScheduling),
  'shift-workforce/demand-based-planning': () =>
    import('./scheduling/demand-skills-staffing').then((m) => m.DemandPlanning),
  'shift-workforce/skill-based-scheduling': () =>
    import('./scheduling/demand-skills-staffing').then((m) => m.SkillScheduling),
  'shift-workforce/staffing-requirements': () =>
    import('./scheduling/demand-skills-staffing').then((m) => m.StaffingRequirements),
  'shift-workforce/availability-preferences': () =>
    import('./scheduling/availability-gaps-workload').then((m) => m.Availability),
  'shift-workforce/coverage-gap-detection': () =>
    import('./scheduling/availability-gaps-workload').then((m) => m.CoverageGaps),
  'shift-workforce/workload-distribution': () =>
    import('./scheduling/availability-gaps-workload').then((m) => m.Workload),
  'shift-workforce/ai-assisted-optimization': () =>
    import('./scheduling/ai-analytics').then((m) => m.AiOptimization),
  'shift-workforce/roster-analytics': () =>
    import('./scheduling/ai-analytics').then((m) => m.RosterAnalytics),
  'leave-absence/leave-types-policies': () =>
    import('./leave/leave-types').then((m) => m.LeaveTypes),
  'leave-absence/leave-balances': () =>
    import('./leave/balances-applications-workflows').then((m) => m.LeaveBalances),
  'leave-absence/leave-applications': () =>
    import('./leave/balances-applications-workflows').then((m) => m.LeaveApplications),
  'leave-absence/approval-workflows': () =>
    import('./leave/balances-applications-workflows').then((m) => m.ApprovalWorkflows),
  'leave-absence/holiday-calendars': () =>
    import('./leave/holidays-calendar-encashment').then((m) => m.HolidayCalendars),
  'leave-absence/leave-calendar': () =>
    import('./leave/holidays-calendar-encashment').then((m) => m.LeaveCalendar),
  'leave-absence/leave-encashment-rules': () =>
    import('./leave/holidays-calendar-encashment').then((m) => m.Encashment),
  'leave-absence/unplanned-absence-tracking': () =>
    import('./leave/absence-rtw-reports').then((m) => m.UnplannedAbsence),
  'leave-absence/return-to-work-tracking': () =>
    import('./leave/absence-rtw-reports').then((m) => m.ReturnToWork),
  'leave-absence/leave-reports-analytics': () =>
    import('./leave/absence-rtw-reports').then((m) => m.LeaveReports),
};
