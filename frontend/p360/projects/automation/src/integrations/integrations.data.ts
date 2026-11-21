// Integrations & API Hub — one shared dataset + root store so actions on one page show on the others.
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AppState } from '@p360/shared/app-state';

export const CATEGORIES = [
  { name: 'HR & Payroll', icon: 'users' },
  { name: 'Identity & Access Management', icon: 'integrations-id' },
  { name: 'Physical & Cyber Security', icon: 'shield' },
  { name: 'Communication & Collaboration', icon: 'message' },
  { name: 'ERP & Business Applications', icon: 'integrations-erp' },
  { name: 'IoT & Device Management', icon: 'integrations-iot' },
  { name: 'Facility & Building Management', icon: 'building' },
  { name: 'IT Services & Infrastructure', icon: 'integrations-server' },
  { name: 'Maps & Location Services', icon: 'map-pin' },
  { name: 'Analytics & BI', icon: 'integrations-analytics' },
  { name: 'Custom Connectors', icon: 'integrations-custom' },
] as const;
export type Category = (typeof CATEGORIES)[number]['name'];
export const SITE_NAMES = ['Head Office', 'Manufacturing', 'Warehouse', 'Logistics Hub', 'Retail Stores', 'Data Center'];

export interface Integ {
  id: string;
  name: string;
  vendor: string;
  category: Category;
  /** Line under the name on cards (defaults to category). */
  sub: string;
  /** Category shown in the details panel (e.g. SAP sells into HR & Payroll). */
  domain: string;
  desc: string;
  long: string;
  badge: 'Certified' | 'Popular';
  pop: number;
  color: string;
  ini: string;
  methods: string;
  auth: string;
  sync: string;
  version: string;
  updated: string;
  features: string[];
  tags: string[];
  objects: string[];
}

const FEAT: Record<string, string[]> = {
  'HR & Payroll': ['Employee master data synchronization', 'Organizational structure and departments', 'Cost center and location mapping', 'Attendance and leave data exchange', 'Custom field mapping', 'Scheduled and real-time sync options'],
  'Identity & Access Management': ['User provisioning and de-provisioning', 'Single sign-on (SAML 2.0 / OIDC)', 'Group and role mapping', 'Password-less authentication', 'Joiner / mover / leaver automation', 'Audit trail of identity changes'],
  'Physical & Cyber Security': ['Cardholder and badge synchronization', 'Real-time access and alarm events', 'Door and reader status monitoring', 'Access level assignment', 'Incident forwarding to SOC', 'Two-way event acknowledgement'],
  'Communication & Collaboration': ['Contact directory synchronization', 'Presence and availability', 'Broadcast and emergency notifications', 'Meeting room integration', 'Call and chat event logging', 'Bot and webhook delivery'],
  'ERP & Business Applications': ['Employee and organizational data', 'Cost center and project codes', 'Purchase order and vendor sync', 'Finance and payroll postings', 'Custom field mapping', 'Scheduled and real-time sync options'],
  'IoT & Device Management': ['Sensor telemetry ingestion', 'Device inventory and health', 'Threshold alerts and rules', 'Firmware and configuration status', 'GPS and asset tracking', 'MQTT and REST data streams'],
  'Facility & Building Management': ['BMS point and alarm import', 'Occupancy and space utilisation', 'HVAC and lighting control', 'Energy metering', 'Work order creation', 'Floor plan and zone mapping'],
  'IT Services & Infrastructure': ['Incident and service request sync', 'Asset and CMDB synchronization', 'Onboarding / offboarding tickets', 'SLA status and escalations', 'Knowledge base links', 'Two-way comment sync'],
  'Maps & Location Services': ['Geocoding of sites and addresses', 'Live map tiles and layers', 'Routing and travel time', 'Geofence management', 'Indoor maps', 'Location search'],
  'Analytics & BI': ['Curated People360 datasets', 'Incremental data refresh', 'Row-level security by site', 'Pre-built dashboards', 'Semantic model export', 'Scheduled extracts'],
  'Custom Connectors': ['Configurable REST / SOAP endpoints', 'Visual field mapping', 'Transformation scripts', 'Retry and dead-letter queue', 'Scheduled or event-driven runs', 'Versioned deployments'],
};
const OBJ: Record<string, string[]> = {
  'HR & Payroll': ['Employees', 'Departments', 'Cost Centers', 'Positions', 'Leave Balances', 'Timesheets'],
  'Identity & Access Management': ['Users', 'Groups', 'Roles', 'Sign-in Events'],
  'Physical & Cyber Security': ['Cardholders', 'Badges', 'Access Levels', 'Door Events', 'Alarms'],
  'Communication & Collaboration': ['Contacts', 'Messages', 'Presence', 'Meetings'],
  'ERP & Business Applications': ['Employees', 'Org Units', 'Cost Centers', 'Vendors', 'Purchase Orders'],
  'IoT & Device Management': ['Devices', 'Telemetry', 'Alerts', 'Locations'],
  'Facility & Building Management': ['Zones', 'Points', 'Alarms', 'Work Orders', 'Occupancy'],
  'IT Services & Infrastructure': ['Incidents', 'Requests', 'Assets', 'Users'],
  'Maps & Location Services': ['Sites', 'Geofences', 'Routes'],
  'Analytics & BI': ['Datasets', 'Reports', 'Refresh Jobs'],
  'Custom Connectors': ['Records', 'Files', 'Events'],
};
const METH: Record<string, [string, string, string]> = {
  'HR & Payroll': ['REST API, OData, SFTP', 'OAuth 2.0 / Basic Auth', 'Real-time / Scheduled'],
  'Identity & Access Management': ['SCIM 2.0, Graph API, LDAP', 'OAuth 2.0 / SAML', 'Real-time'],
  'Physical & Cyber Security': ['REST API, OSDP, Webhooks', 'API Key / Certificate', 'Real-time'],
  'Communication & Collaboration': ['REST API, Webhooks', 'OAuth 2.0', 'Real-time'],
  'ERP & Business Applications': ['REST API, OData, SOAP', 'OAuth 2.0 / Basic Auth', 'Scheduled'],
  'IoT & Device Management': ['MQTT, REST API', 'API Key / TLS Certificate', 'Streaming'],
  'Facility & Building Management': ['BACnet/IP, REST API', 'API Key', 'Real-time / Scheduled'],
  'IT Services & Infrastructure': ['REST API, Webhooks', 'OAuth 2.0 / API Key', 'Real-time'],
  'Maps & Location Services': ['REST API, Tiles', 'API Key', 'On demand'],
  'Analytics & BI': ['OData, JDBC, REST API', 'OAuth 2.0 / Service Principal', 'Scheduled'],
  'Custom Connectors': ['REST, SOAP, SFTP', 'Configurable', 'Event / Scheduled'],
};

// [id, name, vendor, category, sub, badge, color, initials, short description, domain?]
type Row = [string, string, string, Category, string, 'Certified' | 'Popular', string, string, string, string?];
const ROWS: Row[] = [
  ['entra', 'Microsoft Entra ID', 'Microsoft', 'Identity & Access Management', '', 'Certified', 'var(--ka-0ea5e9)', 'EN', 'User sync, SSO, group mapping and automated provisioning.'],
  ['sap', 'SAP', 'SAP', 'ERP & Business Applications', '', 'Certified', 'var(--ka-1d6fe0)', 'SAP', 'Employee data, organizational structure, cost center and more.', 'HR & Payroll'],
  ['avaya', 'Avaya', 'Avaya', 'Communication & Collaboration', '', 'Popular', 'var(--ka-e11d48)', 'AV', 'Integrate with Avaya contact center and communication systems.'],
  ['hid', 'HID', 'HID Global', 'Physical & Cyber Security', '', 'Certified', 'var(--ka-1e3a8a)', 'HID', 'Access control, cardholders and real-time events.'],
  ['ad', 'Active Directory', 'Microsoft', 'Identity & Access Management', 'Identity & Access Management', 'Certified', 'var(--ka-2563eb)', 'AD', 'User sync, authentication and group mapping.'],
  ['oracle', 'Oracle HCM', 'Oracle', 'HR & Payroll', '', 'Certified', 'var(--ka-dc2626)', 'OR', 'Employee data, leave, attendance and organizational data.'],
  ['krystal', 'Krystal DMS', 'Krystal', 'Custom Connectors', 'Document Management', 'Certified', 'var(--ka-1e3a8a)', 'K', 'Employee documents, certificates and compliance records.'],
  ['motadata', 'Motadata', 'Motadata', 'IT Services & Infrastructure', '', 'Popular', 'var(--ka-0284c7)', 'm', 'ITSM, service desk and asset data integration.'],
  ['peoplelink', 'PeopleLink', 'PeopleLink', 'Communication & Collaboration', '', 'Certified', 'var(--ka-1d4ed8)', 'PL', 'Video conferencing, meeting rooms and collaboration.'],
  ['hytera', 'Hytera', 'Hytera', 'Physical & Cyber Security', '', 'Certified', 'var(--ka-0f766e)', 'HY', 'Push-to-talk, device management and communication.'],
  ['milesight', 'Milesight', 'Milesight', 'IoT & Device Management', '', 'Popular', 'var(--ka-2563eb)', 'M', 'IoT sensors, environment monitoring and device data.'],
  ['teltonika', 'Teltonika', 'Teltonika', 'IoT & Device Management', '', 'Certified', 'var(--ka-1d4ed8)', 'TK', 'Vehicle tracking, telematics and asset data.'],
  ['workday', 'Workday', 'Workday', 'HR & Payroll', '', 'Popular', 'var(--ka-f59e0b)', 'WD', 'Worker records, org hierarchy, compensation and absence.'],
  ['adp', 'ADP Payroll', 'ADP', 'HR & Payroll', '', 'Certified', 'var(--ka-ef4444)', 'ADP', 'Payroll results, timesheets and pay elements.'],
  ['bayzat', 'Bayzat', 'Bayzat', 'HR & Payroll', '', 'Certified', 'var(--ka-7c3aed)', 'BZ', 'GCC HR, payroll, WPS and insurance data.'],
  ['darwinbox', 'Darwinbox', 'Darwinbox', 'HR & Payroll', '', 'Certified', 'var(--ka-0ea5e9)', 'DB', 'Core HR, attendance and leave data.'],
  ['zoho', 'Zoho People', 'Zoho', 'HR & Payroll', '', 'Certified', 'var(--ka-16a34a)', 'ZP', 'Employee profiles, attendance and leave.'],
  ['dayforce', 'Dayforce', 'Ceridian', 'HR & Payroll', '', 'Certified', 'var(--ka-0891b2)', 'DF', 'Workforce management, scheduling and payroll.'],
  ['sage', 'Sage People', 'Sage', 'HR & Payroll', '', 'Certified', 'var(--ka-15803d)', 'SG', 'Global HR records, absence and payroll inputs.'],
  ['okta', 'Okta', 'Okta', 'Identity & Access Management', '', 'Popular', 'var(--ka-1e40af)', 'OK', 'Lifecycle management and single sign-on.'],
  ['ping', 'Ping Identity', 'Ping', 'Identity & Access Management', '', 'Certified', 'var(--ka-b91c1c)', 'PI', 'Federated SSO and MFA.'],
  ['gws', 'Google Workspace', 'Google', 'Identity & Access Management', '', 'Certified', 'var(--ka-16a34a)', 'GW', 'Directory users, groups and calendars.'],
  ['onelogin', 'OneLogin', 'One Identity', 'Identity & Access Management', '', 'Certified', 'var(--ka-334155)', 'OL', 'Cloud directory and SSO.'],
  ['cyberark', 'CyberArk', 'CyberArk', 'Identity & Access Management', '', 'Certified', 'var(--ka-1e3a8a)', 'CA', 'Privileged access and vault events.'],
  ['genetec', 'Genetec Security Center', 'Genetec', 'Physical & Cyber Security', '', 'Popular', 'var(--ka-111827)', 'GE', 'Unified video, access control and alarms.'],
  ['lenel', 'LenelS2', 'Carrier', 'Physical & Cyber Security', '', 'Certified', 'var(--ka-1d4ed8)', 'LS', 'OnGuard cardholders, badges and events.'],
  ['gallagher', 'Gallagher', 'Gallagher', 'Physical & Cyber Security', '', 'Certified', 'var(--ka-ea580c)', 'GA', 'Command Centre access and perimeter events.'],
  ['axis', 'Axis Communications', 'Axis', 'Physical & Cyber Security', '', 'Certified', 'var(--ka-ca8a04)', 'AX', 'Network cameras, audio and door controllers.'],
  ['teams', 'Microsoft Teams', 'Microsoft', 'Communication & Collaboration', '', 'Popular', 'var(--ka-6d28d9)', 'T', 'Notifications, approvals and bots in Teams.'],
  ['slack', 'Slack', 'Salesforce', 'Communication & Collaboration', '', 'Certified', 'var(--ka-7e22ce)', 'SL', 'Channel alerts and slash commands.'],
  ['zoom', 'Zoom', 'Zoom', 'Communication & Collaboration', '', 'Certified', 'var(--ka-2563eb)', 'Z', 'Meetings, rooms and webinars.'],
  ['webex', 'Webex', 'Cisco', 'Communication & Collaboration', '', 'Certified', 'var(--ka-0891b2)', 'WX', 'Meetings, calling and room devices.'],
  ['twilio', 'Twilio', 'Twilio', 'Communication & Collaboration', '', 'Certified', 'var(--ka-dc2626)', 'TW', 'SMS, voice and WhatsApp messaging.'],
  ['whatsapp', 'WhatsApp Business', 'Meta', 'Communication & Collaboration', '', 'Popular', 'var(--ka-16a34a)', 'WA', 'Two-way employee and visitor messaging.'],
  ['netsuite', 'Oracle NetSuite', 'Oracle', 'ERP & Business Applications', '', 'Certified', 'var(--ka-334155)', 'NS', 'Finance, subsidiaries and vendor data.'],
  ['d365', 'Dynamics 365', 'Microsoft', 'ERP & Business Applications', '', 'Popular', 'var(--ka-2563eb)', 'D3', 'Finance & operations, projects and HR.'],
  ['odoo', 'Odoo', 'Odoo', 'ERP & Business Applications', '', 'Certified', 'var(--ka-9333ea)', 'OD', 'Employees, contracts and purchasing.'],
  ['infor', 'Infor CloudSuite', 'Infor', 'ERP & Business Applications', '', 'Certified', 'var(--ka-b91c1c)', 'IN', 'ERP, EAM and workforce data.'],
  ['bosch', 'Bosch IoT Suite', 'Bosch', 'IoT & Device Management', '', 'Certified', 'var(--ka-dc2626)', 'BI', 'Device provisioning and telemetry.'],
  ['aws-iot', 'AWS IoT Core', 'Amazon', 'IoT & Device Management', '', 'Certified', 'var(--ka-f59e0b)', 'AW', 'MQTT broker, device shadows and rules.'],
  ['particle', 'Particle', 'Particle', 'IoT & Device Management', '', 'Certified', 'var(--ka-0ea5e9)', 'PA', 'Cellular asset trackers and sensors.'],
  ['desigo', 'Siemens Desigo CC', 'Siemens', 'Facility & Building Management', '', 'Popular', 'var(--ka-0d9488)', 'SI', 'Building automation, alarms and HVAC points.'],
  ['metasys', 'Metasys', 'Johnson Controls', 'Facility & Building Management', '', 'Certified', 'var(--ka-16a34a)', 'JC', 'BMS points, schedules and alarms.'],
  ['ecostruxure', 'EcoStruxure', 'Schneider Electric', 'Facility & Building Management', '', 'Certified', 'var(--ka-15803d)', 'SE', 'Power, building and energy data.'],
  ['forge', 'Honeywell Forge', 'Honeywell', 'Facility & Building Management', '', 'Certified', 'var(--ka-dc2626)', 'HF', 'Building performance and occupancy.'],
  ['servicenow', 'ServiceNow', 'ServiceNow', 'IT Services & Infrastructure', '', 'Popular', 'var(--ka-16a34a)', 'SN', 'Incidents, HR cases and CMDB.'],
  ['jira', 'Jira Service Management', 'Atlassian', 'IT Services & Infrastructure', '', 'Certified', 'var(--ka-2563eb)', 'JS', 'Requests, approvals and assets.'],
  ['freshservice', 'Freshservice', 'Freshworks', 'IT Services & Infrastructure', '', 'Certified', 'var(--ka-0891b2)', 'FS', 'IT tickets and asset management.'],
  ['gmaps', 'Google Maps Platform', 'Google', 'Maps & Location Services', '', 'Popular', 'var(--ka-16a34a)', 'GM', 'Maps, geocoding and routes.'],
  ['arcgis', 'ArcGIS', 'Esri', 'Maps & Location Services', '', 'Certified', 'var(--ka-0369a1)', 'AG', 'GIS layers and spatial analysis.'],
  ['mapbox', 'Mapbox', 'Mapbox', 'Maps & Location Services', '', 'Certified', 'var(--ka-111827)', 'MB', 'Custom map styles and indoor maps.'],
  ['powerbi', 'Power BI', 'Microsoft', 'Analytics & BI', '', 'Popular', 'var(--ka-ca8a04)', 'BI', 'Semantic models and scheduled refresh.'],
  ['tableau', 'Tableau', 'Salesforce', 'Analytics & BI', '', 'Certified', 'var(--ka-1d4ed8)', 'TB', 'Extracts and published data sources.'],
  ['snowflake', 'Snowflake', 'Snowflake', 'Analytics & BI', '', 'Certified', 'var(--ka-0ea5e9)', 'SF', 'Data sharing to the enterprise warehouse.'],
  ['rest', 'Generic REST API', 'People360', 'Custom Connectors', '', 'Certified', 'var(--ka-7c3aed)', '{ }', 'Connect any JSON REST endpoint.'],
  ['soap', 'SOAP / XML Connector', 'People360', 'Custom Connectors', '', 'Certified', 'var(--ka-6d28d9)', '</>', 'Call WSDL-based legacy services.'],
  ['sftp', 'SFTP File Exchange', 'People360', 'Custom Connectors', '', 'Certified', 'var(--ka-475569)', 'FT', 'Scheduled CSV / XML file drops.'],
  ['jdbc', 'Database (JDBC)', 'People360', 'Custom Connectors', '', 'Certified', 'var(--ka-0f766e)', 'DB', 'Read / write SQL Server, Oracle, PostgreSQL.'],
  ['kafka', 'Kafka Stream', 'People360', 'Custom Connectors', '', 'Certified', 'var(--ka-111827)', 'KF', 'Publish and consume event topics.'],
  ['mqtt', 'MQTT Broker', 'People360', 'Custom Connectors', '', 'Certified', 'var(--ka-9333ea)', 'MQ', 'Subscribe to device topics.'],
];

const LONG: Record<string, string> = {
  sap: 'Integrate People360 with SAP to synchronize employee data, organizational structure, cost centers, departments and more.',
};

export const INTEGRATIONS: Integ[] = ROWS.map(([id, name, vendor, category, sub, badge, color, ini, desc, domain], i) => {
  const [methods, auth, sync] = METH[category];
  const d = domain ?? category;
  return {
    id, name, vendor, category, sub: sub || category, domain: d, desc, badge, color, ini,
    long: LONG[id] ?? `Integrate People360 with ${name} — ${desc.charAt(0).toLowerCase() + desc.slice(1)}`,
    pop: 1000 - i * 7,
    methods, auth, sync,
    version: `v${2 + (i % 3)}.${(i * 7) % 6}`,
    updated: `${10 - (i % 9)} Oct 2026`,
    features: FEAT[d] ?? FEAT[category],
    tags: [d, i % 3 === 0 ? 'Bi-directional Sync' : 'One-way Sync', sync.includes('/') ? 'Real-time / Scheduled' : sync],
    objects: OBJ[d] ?? OBJ[category],
  };
});
// SAP details as shown on the reference screen.
Object.assign(INTEGRATIONS.find((x) => x.id === 'sap')!, { version: 'v2.1', updated: '10 Oct 2026', methods: 'REST API, OData, SFTP', sync: 'Real-time / Scheduled', tags: ['HR & Payroll', 'Bi-directional Sync', 'Real-time / Scheduled'] });
export const integ = (id: string) => INTEGRATIONS.find((x) => x.id === id)!;

/* ---------------- Connected systems (28 active) ---------------- */
export type ConnStatus = 'Healthy' | 'Warning' | 'Error' | 'Paused';
export interface Connection {
  id: string;
  integId: string;
  name: string;
  sites: string[];
  status: ConnStatus;
  mode: 'Real-time' | 'Scheduled';
  freq: string;
  lastSync: number; // epoch ms
  records: number; // records synced today
  uptime: number;
  latency: number;
  connectedOn: string;
  owner: string;
  env: 'Production' | 'Sandbox';
  auth: string;
}
const CONN_IDS = ['workday', 'adp', 'bayzat', 'darwinbox', 'okta', 'gws', 'cyberark', 'genetec', 'lenel', 'gallagher', 'axis', 'teams', 'slack', 'zoom', 'twilio', 'whatsapp', 'd365', 'bosch', 'aws-iot', 'desigo', 'metasys', 'forge', 'servicenow', 'jira', 'gmaps', 'powerbi', 'snowflake', 'sftp'];
const OWNERS = ['Rex Kumar', 'Aisha Rahman', 'Daniel Ortiz', 'Mei Lin', 'Omar Haddad', 'Priya Nair'];
const STATUS_AT: Record<number, ConnStatus> = { 4: 'Warning', 10: 'Error', 17: 'Warning', 22: 'Warning', 27: 'Paused' };
const now0 = Date.now();
export const CONNECTIONS: Connection[] = CONN_IDS.map((id, i) => {
  const it = integ(id);
  return {
    id: `CON-${String(101 + i)}`,
    integId: id,
    name: it.name,
    sites: i % 4 === 0 ? [...SITE_NAMES] : SITE_NAMES.filter((_, k) => (k + i) % 3 !== 0),
    status: STATUS_AT[i] ?? 'Healthy',
    mode: it.sync.startsWith('Scheduled') ? 'Scheduled' : 'Real-time',
    freq: it.sync.startsWith('Scheduled') ? ['Every 15 min', 'Hourly', 'Every 6 hours', 'Daily 02:00'][i % 4] : 'Event driven',
    lastSync: now0 - ((i * 97) % 55) * 60000 - 40000,
    records: 1200 + ((i * 7919) % 38000),
    uptime: STATUS_AT[i] === 'Error' ? 97.42 : STATUS_AT[i] === 'Warning' ? 99.61 : 99.9 + ((i * 3) % 10) / 100,
    latency: 80 + ((i * 53) % 340),
    connectedOn: `${1 + ((i * 5) % 27)} ${['Jan', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug'][i % 6]} 2026`,
    owner: OWNERS[i % OWNERS.length],
    env: 'Production',
    auth: it.auth.split(' / ')[0],
  };
});

/* ---------------- API management ---------------- */
export interface ApiKey { id: string; name: string; prefix: string; app: string; scopes: string[]; created: string; lastUsed: string; calls: number; status: 'Active' | 'Revoked' | 'Expiring'; expires: string; owner: string }
export const API_KEYS: ApiKey[] = [
  { id: 'K1', name: 'HRIS Production', prefix: 'p360_live_7Hq2', app: 'Workday Connector', scopes: ['employees:read', 'employees:write', 'org:read'], created: '12 Jan 2026', lastUsed: '2 min ago', calls: 482_310, status: 'Active', expires: '12 Jan 2027', owner: 'Rex Kumar' },
  { id: 'K2', name: 'Access Control Bridge', prefix: 'p360_live_Xk91', app: 'Genetec / LenelS2', scopes: ['access:read', 'events:write'], created: '03 Mar 2026', lastUsed: 'just now', calls: 1_284_552, status: 'Active', expires: '03 Mar 2027', owner: 'Omar Haddad' },
  { id: 'K3', name: 'Power BI Refresh', prefix: 'p360_live_b3Lm', app: 'Power BI', scopes: ['reports:read', 'attendance:read'], created: '19 Apr 2026', lastUsed: '38 min ago', calls: 22_840, status: 'Active', expires: '19 Apr 2027', owner: 'Mei Lin' },
  { id: 'K4', name: 'Mobile App Gateway', prefix: 'p360_live_Q8zt', app: 'People360 Mobile', scopes: ['employees:read', 'attendance:write', 'visitors:write'], created: '01 Feb 2026', lastUsed: 'just now', calls: 2_910_004, status: 'Active', expires: '01 Feb 2027', owner: 'Rex Kumar' },
  { id: 'K5', name: 'Legacy Payroll SFTP', prefix: 'p360_live_n0Rd', app: 'SFTP File Exchange', scopes: ['payroll:read'], created: '14 Nov 2025', lastUsed: '6 h ago', calls: 4_120, status: 'Expiring', expires: '14 Nov 2026', owner: 'Aisha Rahman' },
  { id: 'K6', name: 'IoT Telemetry Ingest', prefix: 'p360_live_c55V', app: 'AWS IoT Core', scopes: ['devices:write', 'events:write'], created: '22 May 2026', lastUsed: 'just now', calls: 6_402_118, status: 'Active', expires: '22 May 2027', owner: 'Daniel Ortiz' },
  { id: 'K7', name: 'Sandbox Testing', prefix: 'p360_test_0aaB', app: 'Developer Portal', scopes: ['*:read'], created: '08 Aug 2026', lastUsed: '3 days ago', calls: 1_902, status: 'Active', expires: '08 Feb 2027', owner: 'Priya Nair' },
  { id: 'K8', name: 'Old Visitor Kiosk', prefix: 'p360_live_Kk20', app: 'Visitor Kiosk v1', scopes: ['visitors:write'], created: '02 Jun 2025', lastUsed: '41 days ago', calls: 88_310, status: 'Revoked', expires: '—', owner: 'Omar Haddad' },
];
export const SCOPES = ['employees:read', 'employees:write', 'org:read', 'attendance:read', 'attendance:write', 'leave:read', 'access:read', 'access:write', 'events:write', 'visitors:read', 'visitors:write', 'devices:write', 'payroll:read', 'reports:read'];

export interface Endpoint { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; group: string; desc: string; calls: number; p95: number; errors: number; body?: string; response: unknown; status?: number }
const EMP = { id: 'EMP-10421', employeeNumber: '10421', firstName: 'Aisha', lastName: 'Rahman', email: 'aisha.rahman@people360.demo', department: 'Human Resources', costCenter: 'CC-1100', site: 'Head Office', status: 'Active', hireDate: '2021-03-14', managerId: 'EMP-10002' };
export const ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/v2/employees', group: 'Employees', desc: 'List employees (paged, filterable by site, department, status)', calls: 184_220, p95: 142, errors: 0.02, response: { data: [EMP, { ...EMP, id: 'EMP-10422', employeeNumber: '10422', firstName: 'Daniel', lastName: 'Ortiz', email: 'daniel.ortiz@people360.demo', department: 'Operations', costCenter: 'CC-2300', site: 'Manufacturing' }], page: 1, pageSize: 2, total: 12480 } },
  { method: 'GET', path: '/v2/employees/{id}', group: 'Employees', desc: 'Get one employee by id', calls: 96_410, p95: 88, errors: 0.01, response: EMP },
  { method: 'POST', path: '/v2/employees', group: 'Employees', desc: 'Create an employee (joiner)', calls: 1_284, p95: 212, errors: 0.4, status: 201, body: JSON.stringify({ firstName: 'Lina', lastName: 'Saeed', email: 'lina.saeed@people360.demo', department: 'Finance', site: 'Head Office', hireDate: '2026-11-09' }, null, 2), response: { id: 'EMP-12481', status: 'Pre-boarding', created: '2026-11-06T10:24:00Z', provisioning: { entraId: 'queued', badge: 'queued', payroll: 'queued' } } },
  { method: 'PATCH', path: '/v2/employees/{id}', group: 'Employees', desc: 'Update employee fields (mover)', calls: 8_902, p95: 160, errors: 0.2, body: JSON.stringify({ department: 'Operations', costCenter: 'CC-2300' }, null, 2), response: { ...EMP, department: 'Operations', costCenter: 'CC-2300', updated: '2026-11-06T10:24:00Z' } },
  { method: 'GET', path: '/v2/org/departments', group: 'Organization', desc: 'Department tree with cost centers', calls: 12_330, p95: 95, errors: 0, response: { data: [{ id: 'D-11', name: 'Human Resources', costCenter: 'CC-1100', headcount: 214, parent: 'D-1' }, { id: 'D-23', name: 'Operations', costCenter: 'CC-2300', headcount: 3124, parent: 'D-1' }], total: 48 } },
  { method: 'GET', path: '/v2/attendance/today', group: 'Attendance', desc: "Today's attendance summary by site", calls: 41_002, p95: 120, errors: 0.05, response: { date: '2026-11-06', present: 7842, late: 326, absent: 752, onLeave: 420, sites: { 'Head Office': 2711, Manufacturing: 2290 } } },
  { method: 'POST', path: '/v2/attendance/punches', group: 'Attendance', desc: 'Submit clock-in / out punches in bulk', calls: 512_884, p95: 64, errors: 0.08, status: 202, body: JSON.stringify({ punches: [{ employeeId: 'EMP-10421', type: 'IN', at: '2026-11-06T08:02:11+04:00', deviceId: 'T-HO-03' }] }, null, 2), response: { accepted: 1, rejected: 0, batchId: 'PB-88213' } },
  { method: 'GET', path: '/v2/leave/balances/{id}', group: 'Leave', desc: 'Leave balances for an employee', calls: 22_617, p95: 101, errors: 0, response: { employeeId: 'EMP-10421', balances: [{ type: 'Annual', entitled: 30, taken: 12, pending: 2, available: 16 }, { type: 'Sick', entitled: 15, taken: 3, available: 12 }] } },
  { method: 'GET', path: '/v2/access/events', group: 'Access', desc: 'Door access events stream (since cursor)', calls: 1_102_440, p95: 58, errors: 0.01, response: { cursor: 'evt_9f21a', events: [{ at: '2026-11-06T10:23:51+04:00', door: 'HO-L1-Main', person: 'EMP-10421', result: 'Granted', credential: 'Card' }, { at: '2026-11-06T10:23:47+04:00', door: 'MFG-Gate-2', person: 'CTR-2210', result: 'Denied', reason: 'Expired induction' }] } },
  { method: 'POST', path: '/v2/visitors', group: 'Visitors', desc: 'Pre-register a visitor', calls: 9_870, p95: 180, errors: 0.3, status: 201, body: JSON.stringify({ name: 'John Carter', company: 'Acme Corp', host: 'EMP-10421', site: 'Head Office', arrival: '2026-11-07T09:30:00+04:00' }, null, 2), response: { id: 'VIS-55120', qrCode: 'https://p360.demo/q/VIS-55120', status: 'Expected' } },
  { method: 'DELETE', path: '/v2/webhooks/{id}', group: 'Webhooks', desc: 'Delete a webhook subscription', calls: 41, p95: 70, errors: 0, status: 204, response: null },
];

/* ---------------- Webhooks ---------------- */
export const EVENT_TYPES = ['employee.created', 'employee.updated', 'employee.terminated', 'attendance.punch', 'leave.approved', 'access.denied', 'access.granted', 'visitor.checked_in', 'emergency.triggered', 'device.offline', 'sync.failed', 'incident.reported'];
export interface Webhook { id: string; name: string; url: string; events: string[]; status: 'Active' | 'Paused' | 'Failing'; secret: string; success: number; delivered: number; created: string; retries: number }
export const WEBHOOKS: Webhook[] = [
  { id: 'WH-01', name: 'Entra provisioning', url: 'https://idm.corp.example/hooks/p360', events: ['employee.created', 'employee.updated', 'employee.terminated'], status: 'Active', secret: 'whsec_••••91af', success: 99.98, delivered: 18_420, created: '14 Feb 2026', retries: 3 },
  { id: 'WH-02', name: 'SOC alert forwarder', url: 'https://soc.corp.example/ingest/people360', events: ['access.denied', 'emergency.triggered', 'incident.reported'], status: 'Active', secret: 'whsec_••••0c3d', success: 99.91, delivered: 6_215, created: '02 Mar 2026', retries: 5 },
  { id: 'WH-03', name: 'Teams notifications', url: 'https://contoso.webhook.office.com/webhookb2/…', events: ['leave.approved', 'visitor.checked_in', 'emergency.triggered'], status: 'Active', secret: 'whsec_••••7b12', success: 99.7, delivered: 22_904, created: '11 Apr 2026', retries: 3 },
  { id: 'WH-04', name: 'Payroll time feed', url: 'https://payroll.corp.example/api/time', events: ['attendance.punch'], status: 'Failing', secret: 'whsec_••••aa40', success: 92.4, delivered: 412_330, created: '20 Jan 2026', retries: 8 },
  { id: 'WH-05', name: 'ServiceNow tickets', url: 'https://corp.service-now.example/api/p360/webhook', events: ['device.offline', 'sync.failed', 'incident.reported'], status: 'Active', secret: 'whsec_••••e2e9', success: 99.95, delivered: 3_402, created: '07 Jun 2026', retries: 5 },
  { id: 'WH-06', name: 'Data lake staging', url: 'https://ingest.datalake.example/p360', events: ['employee.updated', 'access.granted'], status: 'Paused', secret: 'whsec_••••55d0', success: 100, delivered: 980_112, created: '30 Jul 2026', retries: 3 },
];

/* ---------------- Data mapping ---------------- */
export interface MapRule { id: string; source: string; target: string; transform: string }
export interface MapProfile { id: string; integId: string; name: string; direction: string; object: string; version: number; updated: string; sourceFields: { name: string; type: string; sample: string }[]; targetFields: { name: string; type: string; required?: boolean }[]; rules: MapRule[] }
export const TRANSFORMS = ['None', 'Uppercase', 'Lowercase', 'Trim', 'Title Case', 'Date → ISO 8601', 'Lookup: Department', 'Lookup: Site', 'Concatenate', 'Default value', 'Phone → E.164'];
const P360_EMP = [
  { name: 'employeeNumber', type: 'string', required: true }, { name: 'firstName', type: 'string', required: true }, { name: 'lastName', type: 'string', required: true }, { name: 'email', type: 'email', required: true },
  { name: 'department', type: 'ref' }, { name: 'costCenter', type: 'string' }, { name: 'site', type: 'ref' }, { name: 'jobTitle', type: 'string' }, { name: 'hireDate', type: 'date' }, { name: 'managerId', type: 'string' }, { name: 'mobile', type: 'phone' }, { name: 'status', type: 'enum' },
];
export const MAP_PROFILES: MapProfile[] = [
  {
    id: 'MP-1', integId: 'workday', name: 'Workday → People360 Employees', direction: 'Inbound', object: 'Workers', version: 7, updated: '04 Nov 2026',
    sourceFields: [
      { name: 'Worker_ID', type: 'string', sample: '100421' }, { name: 'Legal_First_Name', type: 'string', sample: '  aisha ' }, { name: 'Legal_Last_Name', type: 'string', sample: 'RAHMAN' }, { name: 'Work_Email', type: 'string', sample: 'Aisha.Rahman@Corp.example' },
      { name: 'Supervisory_Org', type: 'string', sample: 'SUP-HR-01' }, { name: 'Cost_Center_Ref', type: 'string', sample: 'CC-1100' }, { name: 'Location_Ref', type: 'string', sample: 'LOC-DXB-HQ' }, { name: 'Business_Title', type: 'string', sample: 'hr business partner' },
      { name: 'Hire_Date', type: 'date', sample: '14/03/2021' }, { name: 'Manager_ID', type: 'string', sample: '100002' }, { name: 'Mobile_Phone', type: 'string', sample: '050 123 4567' }, { name: 'Worker_Status', type: 'string', sample: 'ACTIVE' },
    ],
    targetFields: P360_EMP,
    rules: [
      { id: 'r1', source: 'Worker_ID', target: 'employeeNumber', transform: 'None' }, { id: 'r2', source: 'Legal_First_Name', target: 'firstName', transform: 'Title Case' }, { id: 'r3', source: 'Legal_Last_Name', target: 'lastName', transform: 'Title Case' },
      { id: 'r4', source: 'Work_Email', target: 'email', transform: 'Lowercase' }, { id: 'r5', source: 'Supervisory_Org', target: 'department', transform: 'Lookup: Department' }, { id: 'r6', source: 'Cost_Center_Ref', target: 'costCenter', transform: 'None' },
      { id: 'r7', source: 'Location_Ref', target: 'site', transform: 'Lookup: Site' }, { id: 'r8', source: 'Hire_Date', target: 'hireDate', transform: 'Date → ISO 8601' }, { id: 'r9', source: 'Worker_Status', target: 'status', transform: 'Title Case' },
    ],
  },
  {
    id: 'MP-2', integId: 'adp', name: 'People360 Timesheets → ADP Payroll', direction: 'Outbound', object: 'Timesheets', version: 3, updated: '28 Oct 2026',
    sourceFields: [{ name: 'employeeNumber', type: 'string', sample: '10421' }, { name: 'workDate', type: 'date', sample: '2026-11-05' }, { name: 'regularHours', type: 'number', sample: '8' }, { name: 'overtimeHours', type: 'number', sample: '1.5' }, { name: 'leaveType', type: 'string', sample: 'annual' }, { name: 'costCenter', type: 'string', sample: 'CC-1100' }],
    targetFields: [{ name: 'AssociateID', type: 'string', required: true }, { name: 'PayDate', type: 'date', required: true }, { name: 'RegHrs', type: 'number', required: true }, { name: 'OTHrs', type: 'number' }, { name: 'EarningCode', type: 'string' }, { name: 'Dept', type: 'string' }],
    rules: [{ id: 'r1', source: 'employeeNumber', target: 'AssociateID', transform: 'None' }, { id: 'r2', source: 'workDate', target: 'PayDate', transform: 'None' }, { id: 'r3', source: 'regularHours', target: 'RegHrs', transform: 'None' }, { id: 'r4', source: 'overtimeHours', target: 'OTHrs', transform: 'None' }, { id: 'r5', source: 'leaveType', target: 'EarningCode', transform: 'Uppercase' }],
  },
  {
    id: 'MP-3', integId: 'genetec', name: 'People360 Employees → Genetec Cardholders', direction: 'Outbound', object: 'Cardholders', version: 5, updated: '01 Nov 2026',
    sourceFields: [{ name: 'employeeNumber', type: 'string', sample: '10421' }, { name: 'firstName', type: 'string', sample: 'Aisha' }, { name: 'lastName', type: 'string', sample: 'Rahman' }, { name: 'site', type: 'ref', sample: 'Head Office' }, { name: 'badgeNumber', type: 'string', sample: '0004 5521' }, { name: 'status', type: 'enum', sample: 'Active' }],
    targetFields: [{ name: 'CardholderGuid', type: 'guid' }, { name: 'FirstName', type: 'string', required: true }, { name: 'LastName', type: 'string', required: true }, { name: 'Partition', type: 'string', required: true }, { name: 'CredentialCode', type: 'string', required: true }, { name: 'State', type: 'enum' }],
    rules: [{ id: 'r1', source: 'firstName', target: 'FirstName', transform: 'None' }, { id: 'r2', source: 'lastName', target: 'LastName', transform: 'None' }, { id: 'r3', source: 'site', target: 'Partition', transform: 'Lookup: Site' }, { id: 'r4', source: 'badgeNumber', target: 'CredentialCode', transform: 'Trim' }],
  },
];

/* ---------------- Templates & custom integrations ---------------- */
export interface Step { kind: 'Trigger' | 'Fetch' | 'Transform' | 'Condition' | 'Action' | 'Notify'; label: string; system: string }
export interface Template { id: string; name: string; desc: string; category: string; systems: string[]; steps: Step[]; uses: number; time: string; color: string; icon: string }
export const TEMPLATES: Template[] = [
  { id: 'T1', name: 'Employee Onboarding Automation', desc: 'New hire in HRIS → create identity, issue badge, notify manager.', category: 'HR & Identity', systems: ['workday', 'entra', 'genetec', 'teams'], uses: 184, time: '15 min', color: 'var(--ka-7c3aed)', icon: 'user-plus', steps: [{ kind: 'Trigger', label: 'Worker hired', system: 'Workday' }, { kind: 'Transform', label: 'Map worker → employee', system: 'People360' }, { kind: 'Action', label: 'Create user + groups', system: 'Microsoft Entra ID' }, { kind: 'Action', label: 'Issue access badge', system: 'Genetec' }, { kind: 'Notify', label: 'Welcome card to manager', system: 'Microsoft Teams' }] },
  { id: 'T2', name: 'Leaver De-provisioning', desc: 'Termination → disable accounts, revoke badges, recover assets.', category: 'HR & Identity', systems: ['sap', 'ad', 'lenel', 'servicenow'], uses: 142, time: '10 min', color: 'var(--ka-ef4444)', icon: 'ban', steps: [{ kind: 'Trigger', label: 'Employee terminated', system: 'SAP' }, { kind: 'Action', label: 'Disable account', system: 'Active Directory' }, { kind: 'Action', label: 'Revoke all credentials', system: 'LenelS2' }, { kind: 'Action', label: 'Asset recovery ticket', system: 'ServiceNow' }] },
  { id: 'T3', name: 'Attendance to Payroll', desc: 'Daily approved timesheets exported to payroll with overtime codes.', category: 'Payroll', systems: ['adp', 'sftp'], uses: 96, time: '20 min', color: 'var(--ka-16a34a)', icon: 'clock', steps: [{ kind: 'Trigger', label: 'Daily at 02:00', system: 'Scheduler' }, { kind: 'Fetch', label: 'Approved timesheets', system: 'People360' }, { kind: 'Transform', label: 'Apply earning codes', system: 'People360' }, { kind: 'Action', label: 'Post pay elements', system: 'ADP Payroll' }] },
  { id: 'T4', name: 'Emergency Mass Notification', desc: 'Evacuation trigger → SMS, Teams and PA broadcast with roll-call link.', category: 'Safety', systems: ['twilio', 'teams', 'whatsapp'], uses: 61, time: '8 min', color: 'var(--ka-f97316)', icon: 'megaphone', steps: [{ kind: 'Trigger', label: 'Emergency triggered', system: 'People360' }, { kind: 'Condition', label: 'Site = affected site', system: 'People360' }, { kind: 'Notify', label: 'SMS to on-site people', system: 'Twilio' }, { kind: 'Notify', label: 'Alert channel post', system: 'Microsoft Teams' }] },
  { id: 'T5', name: 'Visitor Pre-registration to Access', desc: 'Approved visitor → temporary QR credential at selected doors.', category: 'Security', systems: ['hid', 'gallagher'], uses: 77, time: '12 min', color: 'var(--ka-2563eb)', icon: 'id-card', steps: [{ kind: 'Trigger', label: 'Visit approved', system: 'People360' }, { kind: 'Action', label: 'Create temporary cardholder', system: 'HID' }, { kind: 'Notify', label: 'Email QR pass', system: 'People360' }] },
  { id: 'T6', name: 'IoT Threshold → Work Order', desc: 'Sensor breach (temperature, CO₂) opens a facility work order.', category: 'Facility & IoT', systems: ['milesight', 'desigo', 'servicenow'], uses: 53, time: '10 min', color: 'var(--ka-0d9488)', icon: 'integrations-iot', steps: [{ kind: 'Trigger', label: 'Telemetry received', system: 'Milesight' }, { kind: 'Condition', label: 'CO₂ > 1,000 ppm', system: 'People360' }, { kind: 'Action', label: 'Adjust ventilation', system: 'Siemens Desigo CC' }, { kind: 'Action', label: 'Create work order', system: 'ServiceNow' }] },
  { id: 'T7', name: 'Org Structure Sync', desc: 'Nightly department & cost-center sync from ERP to People360.', category: 'ERP', systems: ['sap', 'd365'], uses: 120, time: '10 min', color: 'var(--ka-1d6fe0)', icon: 'integrations-erp', steps: [{ kind: 'Trigger', label: 'Nightly 01:00', system: 'Scheduler' }, { kind: 'Fetch', label: 'Org units & cost centers', system: 'SAP' }, { kind: 'Transform', label: 'Build department tree', system: 'People360' }, { kind: 'Action', label: 'Upsert departments', system: 'People360' }] },
  { id: 'T8', name: 'BI Daily Workforce Extract', desc: 'Curated workforce datasets refreshed into Power BI / Snowflake.', category: 'Analytics', systems: ['powerbi', 'snowflake'], uses: 88, time: '6 min', color: 'var(--ka-ca8a04)', icon: 'integrations-analytics', steps: [{ kind: 'Trigger', label: 'Daily 04:00', system: 'Scheduler' }, { kind: 'Fetch', label: 'Attendance & headcount', system: 'People360' }, { kind: 'Action', label: 'Load tables', system: 'Snowflake' }, { kind: 'Action', label: 'Refresh dataset', system: 'Power BI' }] },
];
export interface Custom { id: string; name: string; desc: string; status: 'Published' | 'Draft' | 'Disabled'; owner: string; updated: string; runs: number; success: number; steps: Step[]; fromTemplate?: string }
export const CUSTOMS: Custom[] = [
  { id: 'CI-001', name: 'Contractor induction → site access', desc: 'When a contractor completes induction, grant access levels at assigned sites.', status: 'Published', owner: 'Omar Haddad', updated: '02 Nov 2026', runs: 1_284, success: 99.4, steps: [{ kind: 'Trigger', label: 'Induction completed', system: 'People360' }, { kind: 'Condition', label: 'Documents valid', system: 'People360' }, { kind: 'Action', label: 'Assign access level', system: 'Genetec' }, { kind: 'Notify', label: 'SMS confirmation', system: 'Twilio' }] },
  { id: 'CI-002', name: 'Krystal DMS certificate import', desc: 'Nightly import of training certificates into employee profiles.', status: 'Published', owner: 'Priya Nair', updated: '27 Oct 2026', runs: 214, success: 98.1, steps: [{ kind: 'Trigger', label: 'Nightly 03:00', system: 'Scheduler' }, { kind: 'Fetch', label: 'New certificates', system: 'SFTP File Exchange' }, { kind: 'Transform', label: 'Parse CSV + match employee', system: 'People360' }, { kind: 'Action', label: 'Attach to profile', system: 'People360' }] },
  { id: 'CI-003', name: 'Canteen POS meal deductions', desc: 'Push meal transactions to payroll deductions weekly.', status: 'Draft', owner: 'Mei Lin', updated: '05 Nov 2026', runs: 0, success: 0, steps: [{ kind: 'Trigger', label: 'Weekly Friday 18:00', system: 'Scheduler' }, { kind: 'Fetch', label: 'Meal transactions', system: 'People360' }, { kind: 'Action', label: 'Post deductions', system: 'ADP Payroll' }] },
  { id: 'CI-004', name: 'Fleet telematics geofence alerts', desc: 'Vehicle leaves geofence after hours → alert security.', status: 'Disabled', owner: 'Daniel Ortiz', updated: '11 Sep 2026', runs: 3_902, success: 97.6, steps: [{ kind: 'Trigger', label: 'GPS position', system: 'Teltonika' }, { kind: 'Condition', label: 'Outside geofence & after 20:00', system: 'People360' }, { kind: 'Notify', label: 'Alert patrol team', system: 'Microsoft Teams' }] },
];

/* ---------------- Sync logs ---------------- */
export interface SyncLog { id: string; at: number; connId: string; name: string; integId: string; job: string; direction: 'Inbound' | 'Outbound'; status: 'Success' | 'Warning' | 'Failed' | 'Running'; records: number; errors: number; duration: number; trigger: string; message: string }
const JOBS = ['Delta sync', 'Full sync', 'Event push', 'File import', 'Webhook delivery'];
const MSG_FAIL = ['HTTP 401 Unauthorized — token expired', 'Timeout after 30 s calling /api/time', 'HTTP 429 Too Many Requests — rate limited', 'Schema validation failed: email missing on 3 records'];
export function makeLog(seq: number, at: number, conns: Connection[], forced?: SyncLog['status']): SyncLog {
  const c = conns[(seq * 7) % conns.length];
  const r = (seq * 9301 + 49297) % 233280;
  const status: SyncLog['status'] = forced ?? (c.status === 'Error' && seq % 2 ? 'Failed' : r % 37 === 0 ? 'Failed' : r % 11 === 0 ? 'Warning' : 'Success');
  const records = status === 'Failed' ? 0 : 20 + (r % 2400);
  const errors = status === 'Warning' ? 1 + (r % 6) : status === 'Failed' ? 1 : 0;
  return {
    id: `SYN-${String(48000 + seq)}`, at, connId: c.id, name: c.name, integId: c.integId, job: JOBS[seq % JOBS.length], direction: seq % 3 === 0 ? 'Outbound' : 'Inbound', status, records, errors,
    duration: 0.4 + (r % 900) / 10, trigger: c.mode === 'Real-time' ? 'Event' : seq % 5 === 0 ? 'Manual' : 'Schedule',
    message: status === 'Failed' ? MSG_FAIL[seq % MSG_FAIL.length] : status === 'Warning' ? `${errors} records skipped — validation warnings` : `${records.toLocaleString()} records processed`,
  };
}
export const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
/** API calls per hour today (thousands) — used by API Management & Sync Monitoring. */
export const API_HOURLY = [42, 31, 26, 24, 29, 48, 96, 188, 264, 241, 228, 236, 214, 222, 231, 218, 205, 196, 142, 98, 76, 64, 55, 47];

export const fmtAgo = (ms: number, now = Date.now()) => {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export interface Delivery { id: string; at: number; hookId: string; event: string; code: number; ms: number; attempt: number }
export interface Request { id: string; name: string; vendor: string; category: string; useCase: string; priority: string; at: number; status: string }

@Injectable({ providedIn: 'root' })
export class IntegrationStore {
  private readonly app = inject(AppState);
  readonly connections = signal<Connection[]>(CONNECTIONS.map((c) => ({ ...c })));
  readonly keys = signal<ApiKey[]>(API_KEYS.map((k) => ({ ...k })));
  readonly hooks = signal<Webhook[]>(WEBHOOKS.map((w) => ({ ...w })));
  readonly profiles = signal<MapProfile[]>(MAP_PROFILES.map((p) => ({ ...p, rules: [...p.rules] })));
  readonly customs = signal<Custom[]>(CUSTOMS.map((c) => ({ ...c })));
  readonly requests = signal<Request[]>([]);
  readonly logs = signal<SyncLog[]>([]);
  readonly deliveries = signal<Delivery[]>([]);
  readonly apiCallsToday = signal(3_412_870);
  private seq = 400;

  readonly connectedIds = computed(() => new Set(this.connections().map((c) => c.integId)));
  readonly health = computed(() => {
    const l = this.connections();
    return { total: l.length, healthy: l.filter((c) => c.status === 'Healthy').length, warning: l.filter((c) => c.status === 'Warning').length, error: l.filter((c) => c.status === 'Error').length, paused: l.filter((c) => c.status === 'Paused').length, records: l.reduce((a, c) => a + c.records, 0) };
  });

  constructor() {
    const now = Date.now();
    const conns = this.connections();
    this.logs.set(Array.from({ length: 400 }, (_, i) => makeLog(i, now - (400 - i) * 95_000, conns)).reverse());
    this.deliveries.set(Array.from({ length: 30 }, (_, i) => this.makeDelivery(i, now - i * 47_000)));
    effect(() => {
      const t = this.app.tick();
      untracked(() => {
        if (!t) return;
        this.apiCallsToday.update((v) => v + 180 + ((t * 37) % 140));
        const active = this.connections().filter((c) => c.status !== 'Paused');
        if (t % 2 === 0 && active.length) {
          const log = makeLog(this.seq++, Date.now(), active);
          this.logs.update((l) => [log, ...l].slice(0, 600));
          this.connections.update((l) => l.map((c) => (c.id === log.connId ? { ...c, lastSync: log.at, records: c.records + log.records } : c)));
        }
        if (t % 3 === 0) this.deliveries.update((l) => [this.makeDelivery(this.seq++, Date.now()), ...l].slice(0, 200));
      });
    });
  }

  private makeDelivery(i: number, at: number): Delivery {
    const hooks = this.hooks().filter((h) => h.status !== 'Paused');
    const h = hooks[i % hooks.length];
    const fail = h.status === 'Failing' ? i % 3 === 0 : i % 41 === 0;
    return { id: `DLV-${90000 + i}`, at, hookId: h.id, event: h.events[i % h.events.length], code: fail ? (i % 2 ? 503 : 500) : 200, ms: fail ? 30000 : 60 + ((i * 53) % 400), attempt: 1 };
  }

  connect(integId: string, cfg: { sites: string[]; mode: 'Real-time' | 'Scheduled'; freq: string; env: 'Production' | 'Sandbox'; auth: string }) {
    const it = integ(integId);
    const id = `CON-${101 + this.connections().length + Math.floor(Math.random() * 900)}`;
    const c: Connection = { id, integId, name: it.name, sites: cfg.sites, status: 'Healthy', mode: cfg.mode, freq: cfg.freq, lastSync: Date.now(), records: 0, uptime: 100, latency: 120, connectedOn: '06 Nov 2026', owner: 'Rex Kumar', env: cfg.env, auth: cfg.auth };
    this.connections.update((l) => [c, ...l]);
    this.addLog(c, 'Full sync', 'Manual', 'Running');
    return c;
  }
  disconnect(id: string) {
    this.connections.update((l) => l.filter((c) => c.id !== id));
  }
  patchConn(id: string, ch: Partial<Connection>) {
    this.connections.update((l) => l.map((c) => (c.id === id ? { ...c, ...ch } : c)));
  }
  /** Writes a sync log; "Running" entries complete after a moment. */
  addLog(c: Connection, job: string, trigger: string, status: SyncLog['status'] = 'Running') {
    const log: SyncLog = { ...makeLog(this.seq++, Date.now(), [c], status === 'Running' ? 'Success' : status), job, trigger, status };
    if (status === 'Running') log.message = 'Sync in progress…';
    this.logs.update((l) => [log, ...l]);
    if (status === 'Running')
      setTimeout(() => {
        const recs = 120 + Math.floor(Math.random() * 2400);
        this.logs.update((l) => l.map((x) => (x.id === log.id ? { ...x, status: 'Success', records: recs, errors: 0, duration: 2 + Math.random() * 20, message: `${recs.toLocaleString()} records processed` } : x)));
        this.connections.update((l) => l.map((x) => (x.id === c.id ? { ...x, lastSync: Date.now(), records: x.records + recs, status: x.status === 'Error' || x.status === 'Warning' ? 'Healthy' : x.status } : x)));
      }, 2600);
    return log;
  }
  retry(logId: string) {
    const lg = this.logs().find((l) => l.id === logId);
    const c = lg && this.connections().find((x) => x.id === lg.connId);
    if (c) this.addLog(c, lg!.job, 'Retry');
  }
}
