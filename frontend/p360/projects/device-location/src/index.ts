// Device & Location service — frontend library.
// Owns the pages of these People360 modules. Backend calls go through the API gateway at /api/device-location.
import { PageLoaders, ServiceDef } from '@p360/shared/service';

export const SERVICE: ServiceDef = {
  key: 'device-location',
  title: 'Device & Location',
  gatewayPrefix: '/api/device-location',
  modules: ['real-time-location', 'device-edge-management'],
};

/** Pages built for this service. Key: "module-path/submodule-path". Missing keys show the placeholder page. */
export const PAGES: PageLoaders = {
  'real-time-location/live-people-location': () =>
    import('./rtls/live-location').then((m) => m.LiveLocation),
  'real-time-location/location-history': () =>
    import('./rtls/rtls-pages-a').then((m) => m.LocationHistory),
  'real-time-location/geofences-zones': () =>
    import('./rtls/rtls-pages-a').then((m) => m.Geofences),
  'real-time-location/alerts-notifications': () =>
    import('./rtls/rtls-pages-a').then((m) => m.RtlsAlerts),
  'real-time-location/rtls-devices-tags': () =>
    import('./rtls/rtls-pages-a').then((m) => m.RtlsDevices),
  'real-time-location/heatmaps-analytics': () =>
    import('./rtls/rtls-pages-b').then((m) => m.RtlsHeatmaps),
  'real-time-location/proximity-encounters': () =>
    import('./rtls/rtls-pages-b').then((m) => m.RtlsProximity),
  'real-time-location/sos-emergency-tracking': () =>
    import('./rtls/rtls-pages-b').then((m) => m.RtlsSos),
  'real-time-location/reports-analytics': () =>
    import('./rtls/rtls-pages-b').then((m) => m.RtlsReports),
  'device-edge-management/device-inventory': () =>
    import('./devices/device-inventory').then((m) => m.DeviceInventory),
  'device-edge-management/device-health-monitoring': () =>
    import('./devices/devices-pages-a').then((m) => m.DeviceHealthMonitoring),
  'device-edge-management/device-configuration': () =>
    import('./devices/devices-pages-a').then((m) => m.DeviceConfiguration),
  'device-edge-management/firmware-updates': () =>
    import('./devices/devices-pages-a').then((m) => m.FirmwareUpdates),
  'device-edge-management/edge-gateway-management': () =>
    import('./devices/devices-pages-a').then((m) => m.EdgeGatewayManagement),
  'device-edge-management/network-connectivity': () =>
    import('./devices/devices-pages-b').then((m) => m.NetworkConnectivity),
  'device-edge-management/alerts-notifications': () =>
    import('./devices/devices-pages-b').then((m) => m.DevAlertsNotifications),
  'device-edge-management/device-replacement': () =>
    import('./devices/devices-pages-b').then((m) => m.DeviceReplacement),
  'device-edge-management/settings-integration': () =>
    import('./devices/devices-pages-b').then((m) => m.DevSettingsIntegration),
};
