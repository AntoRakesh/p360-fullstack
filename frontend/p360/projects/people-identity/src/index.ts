// People & Identity service — frontend library.
// Owns the pages of these People360 modules. Backend calls go through the API gateway at /api/people-identity.
import { PageLoaders, ServiceDef } from '@p360/shared/service';

export const SERVICE: ServiceDef = {
  key: 'people-identity',
  title: 'People & Identity',
  gatewayPrefix: '/api/people-identity',
  modules: ['people-identity', 'contractor-vendor'],
};

/** Pages built for this service. Key: "module-path/submodule-path". Missing keys show the placeholder page. */
export const PAGES: PageLoaders = {
  'people-identity/people-directory-unified-profiles': () =>
    import('./people/people-directory').then((m) => m.PeopleDirectory),
  'people-identity/employee-management': () =>
    import('./people/employees').then((m) => m.Employees),
  'people-identity/contractor-personnel': () =>
    import('./people/contractors').then((m) => m.Contractors),
  'people-identity/visitor-profiles': () =>
    import('./people/visitors-customers').then((m) => m.VisitorProfiles),
  'people-identity/customer-profiles': () =>
    import('./people/visitors-customers').then((m) => m.CustomerProfiles),
  'people-identity/temporary-agency-workers': () =>
    import('./people/temp-categories').then((m) => m.TempWorkers),
  'people-identity/person-categories-attributes': () =>
    import('./people/temp-categories').then((m) => m.PersonCategories),
  'people-identity/digital-identity-credentials': () =>
    import('./people/credentials-biometrics').then((m) => m.Credentials),
  'people-identity/biometric-enrollment': () =>
    import('./people/credentials-biometrics').then((m) => m.Biometrics),
  'people-identity/identity-verification-deduplication': () =>
    import('./people/verification-documents').then((m) => m.Verification),
  'people-identity/documents-certifications': () =>
    import('./people/verification-documents').then((m) => m.Documents),
  'people-identity/organizational-hierarchy': () =>
    import('./people/org-hierarchy').then((m) => m.OrgHierarchy),
  'people-identity/person-to-site-zone-assignment': () =>
    import('./people/assignment-lifecycle').then((m) => m.ZoneAssignment),
  'people-identity/identity-lifecycle-offboarding': () =>
    import('./people/assignment-lifecycle').then((m) => m.Lifecycle),
  'people-identity/bulk-import-export': () =>
    import('./people/bulk-import-export').then((m) => m.BulkImportExport),
  'contractor-vendor/contractor-companies': () =>
    import('./contractors/contractor-companies').then((m) => m.ContractorCompanies),
  'contractor-vendor/contractor-employees': () =>
    import('./contractors/contractor-pages-a').then((m) => m.ContractorEmployees),
  'contractor-vendor/contract-management': () =>
    import('./contractors/contractor-pages-a').then((m) => m.ContractManagement),
  'contractor-vendor/document-compliance': () =>
    import('./contractors/contractor-pages-a').then((m) => m.DocumentCompliance),
  'contractor-vendor/induction-training': () =>
    import('./contractors/contractor-pages-a').then((m) => m.InductionTraining),
  'contractor-vendor/access-work-permits': () =>
    import('./contractors/contractor-pages-a').then((m) => m.WorkPermits),
  'contractor-vendor/on-site-attendance': () =>
    import('./contractors/contractor-pages-a').then((m) => m.ContractorAttendance),
  'contractor-vendor/contractor-performance': () =>
    import('./contractors/contractor-pages-b').then((m) => m.ContractorPerformance),
  'contractor-vendor/vendor-management': () =>
    import('./contractors/contractor-pages-b').then((m) => m.VendorManagement),
  'contractor-vendor/blacklisted-companies': () =>
    import('./contractors/contractor-pages-b').then((m) => m.BlacklistedCompanies),
  'contractor-vendor/reports-analytics': () =>
    import('./contractors/contractor-pages-b').then((m) => m.ContractorReports),
};
