// Automation service — frontend library.
// Owns the pages of these People360 modules. Backend calls go through the API gateway at /api/automation.
import { PageLoaders, ServiceDef } from '@p360/shared/service';

export const SERVICE: ServiceDef = {
  key: 'automation',
  title: 'Automation',
  gatewayPrefix: '/api/automation',
  modules: ['workflow-automation', 'integrations-api-hub'],
};

/** Pages built for this service. Key: "module-path/submodule-path". Missing keys show the placeholder page. */
export const PAGES: PageLoaders = {
  'workflow-automation/workflow-designer': () =>
    import('./workflow/workflow-designer').then((m) => m.WorkflowDesigner),
  'workflow-automation/workflow-list': () =>
    import('./workflow/workflow-pages-a').then((m) => m.WorkflowList),
  'workflow-automation/workflow-instances': () =>
    import('./workflow/workflow-pages-a').then((m) => m.WorkflowInstances),
  'workflow-automation/my-tasks-approvals': () =>
    import('./workflow/workflow-pages-a').then((m) => m.MyTasksApprovals),
  'workflow-automation/automation-rules': () =>
    import('./workflow/workflow-pages-b').then((m) => m.AutomationRules),
  'workflow-automation/integrations-connectors': () =>
    import('./workflow/workflow-pages-b').then((m) => m.IntegrationsConnectors),
  'workflow-automation/workflow-analytics': () =>
    import('./workflow/workflow-pages-b').then((m) => m.WorkflowAnalytics),
  'integrations-api-hub/integration-marketplace': () =>
    import('./integrations/integration-marketplace').then((m) => m.IntegrationMarketplace),
  'integrations-api-hub/connected-systems': () =>
    import('./integrations/integrations-pages-a').then((m) => m.ConnectedSystems),
  'integrations-api-hub/api-management': () =>
    import('./integrations/integrations-pages-a').then((m) => m.APIManagement),
  'integrations-api-hub/webhooks-event-hub': () =>
    import('./integrations/integrations-pages-a').then((m) => m.WebhooksEventHub),
  'integrations-api-hub/data-mapping-transformation': () =>
    import('./integrations/integrations-pages-a').then((m) => m.DataMappingTransformation),
  'integrations-api-hub/sync-logs-monitoring': () =>
    import('./integrations/integrations-pages-b').then((m) => m.SyncLogsMonitoring),
  'integrations-api-hub/integration-templates': () =>
    import('./integrations/integrations-pages-b').then((m) => m.IntegrationTemplates),
  'integrations-api-hub/custom-integrations': () =>
    import('./integrations/integrations-pages-b').then((m) => m.CustomIntegrations),
};
