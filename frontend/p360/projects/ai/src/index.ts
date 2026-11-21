// AI service — frontend library.
// Owns the pages of these People360 modules. Backend calls go through the API gateway at /api/ai.
import { PageLoaders, ServiceDef } from '@p360/shared/service';

export const SERVICE: ServiceDef = {
  key: 'ai',
  title: 'AI',
  gatewayPrefix: '/api/ai',
  modules: ['ai-people-intelligence'],
};

/** Pages built for this service. Key: "module-path/submodule-path". Missing keys show the placeholder page. */
export const PAGES: PageLoaders = {
  'ai-people-intelligence/people360-ai-copilot': () =>
    import('./ai/people360-ai-copilot').then((m) => m.People360AICopilot),
  'ai-people-intelligence/workforce-insights': () =>
    import('./ai/ai-pages-a').then((m) => m.WorkforceInsights),
  'ai-people-intelligence/predictive-analytics': () =>
    import('./ai/ai-pages-a').then((m) => m.PredictiveAnalytics),
  'ai-people-intelligence/anomaly-detection': () =>
    import('./ai/ai-pages-a').then((m) => m.AnomalyDetection),
  'ai-people-intelligence/natural-language-reports': () =>
    import('./ai/ai-pages-b').then((m) => m.NaturalLanguageReports),
  'ai-people-intelligence/recommendation-engine': () =>
    import('./ai/ai-pages-b').then((m) => m.RecommendationEngine),
};
