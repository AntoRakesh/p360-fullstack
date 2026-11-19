import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ActivationInfo,
  AuditEvent,
  AuditQuery,
  CatalogResponse,
  Dashboard,
  Entitlement,
  EntitlementInput,
  EntitlementQuery,
  InstallKey,
  Paged,
  RenewInput,
} from './models';

/** Drop empty values so the query string stays clean. */
function params(q: object): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  catalog(): Observable<CatalogResponse> {
    // Not cached: small, and must reflect the API that is running now (e.g. after a restart).
    return this.http.get<CatalogResponse>('/api/catalog');
  }

  dashboard(): Observable<Dashboard> {
    return this.http.get<Dashboard>('/api/dashboard');
  }

  list(q: EntitlementQuery): Observable<Paged<Entitlement>> {
    return this.http.get<Paged<Entitlement>>('/api/entitlements', { params: params(q) });
  }

  get(id: string): Observable<Entitlement> {
    return this.http.get<Entitlement>(`/api/entitlements/${encodeURIComponent(id)}`);
  }

  history(subscriberCode: string): Observable<Entitlement[]> {
    return this.http.get<Entitlement[]>(`/api/entitlements/history/${encodeURIComponent(subscriberCode)}`);
  }

  create(input: EntitlementInput): Observable<Entitlement> {
    return this.http.post<Entitlement>('/api/entitlements', input);
  }

  renew(id: string, input: RenewInput): Observable<Entitlement> {
    return this.http.post<Entitlement>(`/api/entitlements/${encodeURIComponent(id)}/renew`, input);
  }

  changeState(id: string, action: 'suspend' | 'resume' | 'revoke', reason: string): Observable<Entitlement> {
    return this.http.post<Entitlement>(`/api/entitlements/${encodeURIComponent(id)}/${action}`, { reason });
  }

  downloadFile(id: string): Observable<Blob> {
    return this.http.get(`/api/entitlements/${encodeURIComponent(id)}/file`, { responseType: 'blob' });
  }

  /** Full client DB connection string. The view is recorded in the audit log. */
  revealClientDb(id: string): Observable<{ connectionString: string }> {
    return this.http.get<{ connectionString: string }>(`/api/entitlements/${encodeURIComponent(id)}/client-db`);
  }

  installKey(id: string): Observable<InstallKey> {
    return this.http.post<InstallKey>(`/api/entitlements/${encodeURIComponent(id)}/install-key`, {});
  }

  parseActivation(file: File): Observable<ActivationInfo> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ActivationInfo>('/api/activation/parse', form);
  }

  audit(q: AuditQuery): Observable<Paged<AuditEvent>> {
    return this.http.get<Paged<AuditEvent>>('/api/audit', { params: params(q) });
  }
}
