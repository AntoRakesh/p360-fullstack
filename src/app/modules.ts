export interface SubModule {
  path: string;
  title: string;
  icon: string;
}

export interface AppModule {
  no: number;
  path: string;
  title: string;
  icon: string;
  children?: SubModule[];
}

/** Child entries are "Title" or "Title|icon" (explicit icon overrides the default). */
type Entry = [path: string, title: string, icon: string, children?: string[]];

const LIST: Entry[] = [
  ['command-center', 'Command Center & Dashboards', 'home', [
    'Enterprise Overview Dashboard|home', 'People Presence Dashboard|users', 'Attendance Dashboard|clock',
    'Access & Security Dashboard|shield-check', 'Visitor & Contractor Dashboard|user-plus', 'Emergency & Safety Dashboard|siren',
    'Workforce Productivity|trending-up', 'Multi-Site Operations|building', 'AI Insights & Recommendations|sparkles',
    'Custom Dashboard Builder|sliders', 'Executive KPI Scorecards|star', 'Alerts & Action Center|bell',
  ]],
  ['people-identity', 'People & Identity Management', 'users', [
    'People Directory/Unified Profiles|users', 'Employee Management|square-user', 'Contractor Personnel|hard-hat',
    'Visitor Profiles|user-plus', 'Customer Profiles|user', 'Temporary & Agency Workers|briefcase',
    'Person Categories & Attributes|list-checks', 'Digital Identity & Credentials|id-card', 'Biometric Enrollment|fingerprint',
    'Identity Verification & Deduplication|file-check', 'Documents & Certifications|file-text', 'Organizational Hierarchy|workflow',
    'Person-to-Site/Zone Assignment|map-pin', 'Identity Lifecycle & Offboarding|refresh', 'Bulk Import/Export|download',
  ]],
  ['time-attendance', 'Time & Attendance', 'clock', [
    'Live Attendance Monitor|activity', 'Attendance Transactions|fingerprint', 'Daily/Monthly Timesheets|calendar-days',
    'Attendance Policies|file-text', 'Break & Overtime Management|coffee', 'Attendance Regularization|file-check',
    'Absence & Exception Management|triangle-alert', 'Attendance Reports & Analytics|file-chart',
  ]],
  ['shift-workforce', 'Shift & Workforce Scheduling', 'calendar-days', [
    'Shift Master|file-text', 'Shift Templates & Rotations|refresh', 'Roster Planning|calendar-days',
    'Employee Shift Assignment|user-check', 'Shift Swap & Requests|refresh', 'Overtime Scheduling|clock',
    'Demand-Based Planning|trending-up', 'Skill-Based Scheduling|graduation-cap', 'Staffing Requirements|users',
    'Availability & Preferences|sliders', 'Coverage Gap Detection|triangle-alert', 'Workload Distribution|chart-line',
    'Schedule Approvals|file-check', 'AI-Assisted Optimization|sparkles', 'Roster Analytics|chart-line',
  ]],
  ['leave-absence', 'Leave & Absence Management', 'calendar-x', [
    'Leave Types & Policies|file-text', 'Leave Balances|briefcase', 'Leave Applications|file-text', 'Approval Workflows|workflow',
    'Holiday Calendars|calendar-days', 'Leave Calendar|calendar-days', 'Leave Encashment Rules|briefcase',
    'Unplanned Absence Tracking|calendar-x', 'Return-to-Work Tracking|user-check', 'Leave Reports & Analytics|file-chart',
  ]],
  ['physical-access-control', 'Physical Access Control', 'shield-check', [
    'Live Access Events|activity', 'Door Monitoring|door-open', 'Access Logs|list-checks', 'Access Control Schedules|calendar-days',
    'Access Levels & Permissions|shield-check', 'Credential Management|id-card', 'Visitor Access Integration|user-plus',
    'Anti-Passback & Security Rules|ban', 'Door Alarms & Tamper Events|bell', 'Access Reports & Analytics|file-chart',
  ]],
  ['visitor-management', 'Visitor Management', 'user-plus', [
    'Visitor Dashboard|home', 'Find Your Visit|search', 'Pre-Registration|calendar-days', 'Walk-in Registration|user-plus',
    'Visit Invitations|twin-mail', 'QR Invitations & Digital Passes|tasks-qr', 'Visit Scheduling|calendar-days',
    'Group / VIP Visits|star', 'Visitor Approvals|file-check', 'ID Verification|id-card',
    'Visitor Check-In / Check-Out|door-open', 'Visitor Passes & Badges|id-card', 'Deliveries & Pickups|w-package',
    'Host Management|users', 'Host Notifications|bell', 'Visitor Location & Escort|map-pin',
    'Emergency Visitor Accountability|flame', 'Watchlist & Blacklist|ban', 'Visitor Logs & History|list-checks',
    'Visitor Categories & Rules|file-text', 'Vehicle Management|truck', 'Visitor Analytics & Reports|file-chart',
  ]],
  ['contractor-vendor', 'Contractor & Vendor Workforce', 'hard-hat', [
    'Contractor Companies|building', 'Contractor Employees|users', 'Contract Management|file-text', 'Document & Compliance|file-check',
    'Induction & Training|graduation-cap', 'Access & Work Permits|key-round', 'On-site Attendance|clock',
    'Contractor Performance|star', 'Vendor Management|truck', 'Blacklisted Companies|ban', 'Reports & Analytics|file-chart',
  ]],
  ['real-time-location', 'Real-Time Location (RTLS)', 'map-pin', [
    'Live People Location|map-pin', 'Location History|clock', 'Geofences & Zones|map-floor', 'Alerts & Notifications|bell',
    'RTLS Devices & Tags|cpu', 'Heatmaps & Analytics|map-floor', 'Proximity & Encounters|users', 'SOS & Emergency Tracking|siren',
    'Reports & Analytics|file-chart',
  ]],
  ['emergency-mustering', 'Emergency & Mustering', 'siren', [
    'Emergency Command Center|home', 'Active Evacuations|door-open', 'Muster Points|map-pin', 'Accountability|user-check',
    'Missing Persons|triangle-alert', 'Zones & Areas|map-floor', 'Wardens & Teams|users', 'Events & Drills|calendar-days',
    'Notifications|bell', 'Incidents & Reports|file-chart', 'Emergency Devices|cpu', 'Configuration & Masters|settings',
  ]],
  ['safety-wellbeing', 'Safety & Wellbeing', 'shield-plus', [
    'Safety Command Center|home', 'Incident Management|siren', 'Hazard & Risk Management|triangle-alert', 'Safety Inspections|file-check',
    'Permits & Work Authorizations|key-round', 'Toolbox Talks & Training|graduation-cap', 'PPE & Compliance|hard-hat',
    'Safety Observations (Near Miss)|activity', 'Health & Wellbeing|shield-plus', 'Reports & Analytics|file-chart',
  ]],
  ['patrol-guard-management', 'Patrol & Guard Management', 'id-card', [
    'Guard Directory|users', 'Guard Shifts & Rosters|calendar-days', 'Patrol Routes & Checkpoints|map-pin',
    'Live Patrol Monitoring|activity', 'Incidents & Reports|file-chart', 'Guard Performance|star',
    'Training & Certifications|graduation-cap', 'Equipment & Assets|box', 'Permits & Access|key-round',
    'Contractor Guards|hard-hat', 'Settings & Configuration|settings',
  ]],
  ['customer-visitor-analytics', 'Customer & Visitor Analytics', 'chart-line', [
    'Footfall & People Counting|users', 'Dwell Time & Movement|clock', 'Zone & Area Analytics|map-floor', 'Demographics (AI)|sparkles',
    'Repeat vs New Visitors|refresh', 'Heatmaps & Trajectories|map-floor', 'Queue Management|list-checks',
    'Conversion & Engagement|trending-up', 'Reports & Insights|file-chart', 'Device Management|cpu',
  ]],
  ['meal-canteen-management', 'Meal & Canteen Management', 'utensils', [
    'Meal Plans & Policies|file-text', 'Menu Management|utensils', 'Canteen Locations|map-pin', 'Meal Booking & Pre-order|calendar-days',
    'Meal Entitlement & Wallet|briefcase', 'Subsidy & Pricing|sliders', 'Allergen & Nutritional Info|shield-plus',
    'Feedback & Ratings|star', 'Reports & Analytics|file-chart',
  ]],
  ['workplace-facility-services', 'Workplace & Facility Services', 'building', [
    'Desk & Workspace Booking|briefcase', 'Meeting Room Booking|users', 'Parking Booking|truck', 'Facility Requests|message',
    'Asset & Equipment Booking|box', 'Space Utilization|chart-line', 'Housekeeping & Cleaning|sparkles',
    'Maintenance Requests|settings', 'Service Catalog|list-checks', 'Approvals & SLA|file-check', 'Reports & Analytics|file-chart',
  ]],
  ['employee-self-service', 'Employee Self-Service (ESS)', 'square-user'],
  ['manager-self-service', 'Manager Self-Service (MSS)', 'briefcase'],
  ['tasks-workforce-operations', 'Tasks & Workforce Operations', 'list-checks', [
    'Task Master & Templates|file-text', 'Task Assignment & Scheduling|calendar-days', 'Daily Task Execution|list-checks',
    'Mobile Task App|square-user', 'Checkpoint & Location Tasks|map-pin', 'SLA & Escalations|bell',
    'Task Verification & Approvals|file-check', 'Productivity & Performance|trending-up', 'Reports & Analytics|file-chart',
  ]],
  ['training-skills-compliance', 'Training, Skills & Compliance', 'graduation-cap', [
    'Skills & Competency Matrix|grid', 'Training Catalog|list-checks', 'Training Plan & Enrollment|calendar-days',
    'Learning Paths|workflow', 'Certifications & Licenses|id-card', 'Compliance Tracking|file-check',
    'Assessments & Evaluations|list-checks', 'Renewals & Expiry Alerts|bell', 'Reports & Analytics|file-chart',
  ]],
  ['digital-twin', 'Digital Twin & Spatial Intelligence', 'box', [
    '2D/3D Facility Viewer|box', 'Space & Zone Management|map-floor', 'Asset Visualization|box', 'People & Asset Location|map-pin',
    'Sensor & IoT Visualization|cpu', 'Heatmaps & Analytics|map-floor', 'Path & Movement Analysis|activity',
    'Scenario Simulation|sparkles', 'Reports & Insights|file-chart',
  ]],
  ['ai-people-intelligence', 'AI & People Intelligence', 'sparkles', [
    'People360 AI Copilot|bot', 'Workforce Insights|chart-line', 'Predictive Analytics|trending-up', 'Anomaly Detection|activity',
    'Natural Language Reports|message', 'Recommendation Engine|lightbulb',
  ]],
  ['reports-analytics', 'Reports & Analytics', 'file-chart', [
    'Report Library|list-checks', 'Standard Reports|file-text', 'Custom Report Builder|sliders', 'Scheduled Reports|calendar-days',
    'Dashboards|home', 'Data Export|download', 'Report Sharing & Access|users', 'Report Audit Trail|activity',
  ]],
  ['workflow-automation', 'Workflow & Automation', 'workflow', [
    'Workflow Designer|workflow', 'Workflow List|list-checks', 'Workflow Instances|activity', 'My Tasks & Approvals|file-check',
    'Automation Rules|sliders', 'Integrations & Connectors|plug', 'Workflow Analytics|chart-line',
  ]],
  ['device-edge-management', 'Device & Edge Management', 'cpu', [
    'Device Inventory|box', 'Device Health & Monitoring|activity', 'Device Configuration|sliders', 'Firmware & Updates|download',
    'Edge Gateway Management|router', 'Network Connectivity|wifi', 'Alerts & Notifications|bell', 'Device Replacement|refresh',
    'Settings & Integration|plug',
  ]],
  ['integrations-api-hub', 'Integrations & API Hub', 'plug', [
    'Integration Marketplace|box', 'Connected Systems|plug', 'API Management|cpu', 'Webhooks & Event Hub|activity',
    'Data Mapping & Transformation|workflow', 'Sync Logs & Monitoring|refresh', 'Integration Templates|file-text',
    'Custom Integrations|sliders',
  ]],
  ['administration-configuration', 'Administration & Configuration', 'settings', [
    'Organization & Tenant Setup|building', 'Sites & Locations|map-pin', 'Departments & Teams|users',
    'Roles & Permissions|shield-check', 'User & Group Management|users', 'Module Access|key-round', 'System Settings|settings',
    'Audit Logs|list-checks', 'Data & Privacy|shield', 'Branding & Localization|sparkles', 'Subscription & Licensing|briefcase',
  ]],
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const MODULES: AppModule[] = LIST.map(([path, title, icon, children], i) => ({
  no: i + 1,
  path,
  title,
  icon,
  children: children?.map((entry) => {
    const [t, ic] = entry.split('|');
    return { path: slug(t), title: t, icon: ic ?? icon };
  }),
}));
