import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => ctrl.verify());

  function signIn(): void {
    auth.verifyMfa('mfa', '123456').subscribe();
    ctrl.expectOne('/api/auth/mfa').flush({
      accessToken: 'tok',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      user: { username: 'admin', roles: ['LicenseAdmin'] },
    });
  }

  it('adds Bearer token after login', () => {
    signIn();
    expect(auth.isLoggedIn()).toBe(true);
    http.get('/api/dashboard').subscribe();
    expect(ctrl.expectOne('/api/dashboard').request.headers.get('Authorization')).toBe('Bearer tok');
  });

  it('does not send token to login endpoint', () => {
    signIn();
    auth.login('a', 'b').subscribe();
    expect(ctrl.expectOne('/api/auth/login').request.headers.has('Authorization')).toBe(false);
  });

  it('logs out and redirects to /login on 401', () => {
    signIn();
    const nav = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    http.get('/api/entitlements').subscribe({ error: () => {} });
    ctrl.expectOne('/api/entitlements').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(auth.isLoggedIn()).toBe(false);
    expect(nav).toHaveBeenCalledWith(['/login'], expect.anything());
  });
});
