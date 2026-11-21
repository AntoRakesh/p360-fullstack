// Digital Twin service — frontend library.
// Owns the pages of these People360 modules. Backend calls go through the API gateway at /api/digital-twin.
import { PageLoaders, ServiceDef } from '@p360/shared/service';

export const SERVICE: ServiceDef = {
  key: 'digital-twin',
  title: 'Digital Twin',
  gatewayPrefix: '/api/digital-twin',
  modules: ['digital-twin'],
};

/** Pages built for this service. Key: "module-path/submodule-path". Missing keys show the placeholder page. */
export const PAGES: PageLoaders = {
  'digital-twin/2d-3d-facility-viewer': () =>
    import('./twin/v2d-3d-facility-viewer').then((m) => m.Facility2D3DFacilityViewer),
  'digital-twin/space-zone-management': () =>
    import('./twin/twin-pages-a').then((m) => m.SpaceZoneManagement),
  'digital-twin/asset-visualization': () =>
    import('./twin/twin-pages-a').then((m) => m.AssetVisualization),
  'digital-twin/people-asset-location': () =>
    import('./twin/twin-pages-a').then((m) => m.PeopleAssetLocation),
  'digital-twin/sensor-iot-visualization': () =>
    import('./twin/twin-pages-a').then((m) => m.SensorIoTVisualization),
  'digital-twin/heatmaps-analytics': () =>
    import('./twin/twin-pages-b').then((m) => m.HeatmapsAnalytics),
  'digital-twin/path-movement-analysis': () =>
    import('./twin/twin-pages-b').then((m) => m.PathMovementAnalysis),
  'digital-twin/scenario-simulation': () =>
    import('./twin/twin-pages-b').then((m) => m.ScenarioSimulation),
  'digital-twin/reports-insights': () =>
    import('./twin/twin-pages-b').then((m) => m.TwinReportsInsights),
};
