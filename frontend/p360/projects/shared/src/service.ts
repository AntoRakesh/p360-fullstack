// Contract every service library follows. Shell reads SERVICE + PAGES from each library's index.ts.
import { Type } from '@angular/core';

/** One backend microservice and the People360 modules it owns. */
export interface ServiceDef {
  key: string;
  title: string;
  /** Path prefix on the API gateway for this service's backend, e.g. /api/workforce-time. */
  gatewayPrefix: string;
  /** Module paths (see modules.ts) this service owns. */
  modules: string[];
}

/** Lazy page loaders. Key: "module-path/submodule-path". */
export type PageLoaders = Record<string, () => Promise<Type<unknown>>>;
