import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { API_BASE_URL } from './api-base-url.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('is not authenticated before login', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.accessToken()).toBeNull();
  });

  it('login() stores the access token in memory and the refresh token in localStorage, then loads the current actor', async () => {
    const loginPromise = service.login('demo-human@pmhybrid.local', 'demo1234');

    const loginReq = httpMock.expectOne(`${API_BASE_URL}/auth/login`);
    expect(loginReq.request.method).toBe('POST');
    loginReq.flush({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    // Let the async continuation inside login() run so it issues the /auth/me request.
    await Promise.resolve();
    await Promise.resolve();

    const meReq = httpMock.expectOne(`${API_BASE_URL}/auth/me`);
    meReq.flush({
      id: 'actor-1',
      displayName: 'Demo Human',
      email: 'demo-human@pmhybrid.local',
      kind: 'HUMAN',
    });

    await loginPromise;

    expect(service.isAuthenticated()).toBe(true);
    expect(service.accessToken()).toBe('access-1');
    expect(localStorage.getItem('pmhybrid.refreshToken')).toBe('refresh-1');
    expect(service.currentActor()?.displayName).toBe('Demo Human');
  });

  it('logout() clears in-memory token and the stored refresh token', () => {
    localStorage.setItem('pmhybrid.refreshToken', 'refresh-1');
    service.logout();
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('pmhybrid.refreshToken')).toBeNull();
  });

  it('refresh() returns false and stays unauthenticated when no refresh token is stored', async () => {
    const refreshed = await service.refresh();
    expect(refreshed).toBe(false);
    expect(service.isAuthenticated()).toBe(false);
  });
});
