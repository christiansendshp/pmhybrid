import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authInterceptor } from './auth.interceptor.js';
import { AuthService } from './auth.service.js';

/**
 * The interceptor attaches the token and, on a 401, refreshes exactly once and
 * retries — never loops, and never refreshes for the auth endpoints themselves
 * (Roadmap TEST-01c).
 */
describe('authInterceptor', () => {
  let token: string | null;
  let refresh: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    token = 'access-1';
    refresh = vi.fn();
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { accessToken: () => token, refresh } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  /** Lets the refresh promise settle so the retried request has been issued. */
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it('sends the access token as a bearer header, and no header when there is none', () => {
    http.get('/projects').subscribe();
    expect(backend.expectOne('/projects').request.headers.get('Authorization')).toBe(
      'Bearer access-1',
    );

    token = null;
    http.get('/public').subscribe();
    expect(backend.expectOne('/public').request.headers.has('Authorization')).toBe(false);
  });

  it('passes a non-401 error straight through, without a refresh', () => {
    const errors: number[] = [];
    http.get('/projects').subscribe({ error: (e) => errors.push(e.status) });

    backend.expectOne('/projects').flush('nope', { status: 500, statusText: 'Server Error' });

    expect(errors).toEqual([500]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes once on a 401 and retries the request with the new token', async () => {
    refresh.mockImplementation(async () => {
      token = 'access-2';
      return true;
    });
    let body: unknown;
    http.get('/projects').subscribe((value) => (body = value));

    backend.expectOne('/projects').flush('expired', { status: 401, statusText: 'Unauthorized' });
    await settle();
    const retry = backend.expectOne('/projects');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
    retry.flush({ ok: true });

    expect(body).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("retries exactly once: a second 401 is the caller's error, not another refresh", async () => {
    refresh.mockResolvedValue(true);
    const errors: number[] = [];
    http.get('/projects').subscribe({ error: (e) => errors.push(e.status) });

    backend.expectOne('/projects').flush('x', { status: 401, statusText: 'Unauthorized' });
    await settle();
    backend.expectOne('/projects').flush('x', { status: 401, statusText: 'Unauthorized' });
    await settle();

    expect(errors).toEqual([401]);
    expect(refresh).toHaveBeenCalledTimes(1);
    backend.expectNone('/projects');
  });

  it('goes to the login page and fails the request when the refresh fails', async () => {
    refresh.mockResolvedValue(false);
    const errors: number[] = [];
    http.get('/projects').subscribe({ error: (e) => errors.push(e.status) });

    backend.expectOne('/projects').flush('x', { status: 401, statusText: 'Unauthorized' });
    await settle();

    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(errors).toEqual([401]);
    backend.expectNone('/projects');
  });

  it('never tries to refresh on the login or refresh endpoints themselves', () => {
    const errors: number[] = [];
    http.post('/auth/login', {}).subscribe({ error: (e) => errors.push(e.status) });
    backend.expectOne('/auth/login').flush('x', { status: 401, statusText: 'Unauthorized' });

    http.post('/auth/refresh', {}).subscribe({ error: (e) => errors.push(e.status) });
    backend.expectOne('/auth/refresh').flush('x', { status: 401, statusText: 'Unauthorized' });

    expect(errors).toEqual([401, 401]);
    expect(refresh).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
