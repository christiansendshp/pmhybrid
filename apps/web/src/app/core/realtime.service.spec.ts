import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL } from './api-base-url.js';
import { AuthService } from './auth.service.js';
import { RealtimeService, RECONNECT_DELAY_MS } from './realtime.service.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  emit(type: string, event: unknown = {}): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }

  close(): void {
    this.readyState = 3;
    this.emit('close');
  }
}

describe('RealtimeService (Roadmap GAP-26)', () => {
  let authService: AuthService;
  let realtimeService: RealtimeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    authService = TestBed.inject(AuthService);
    realtimeService = TestBed.inject(RealtimeService);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    httpMock.verify();
  });

  async function login(): Promise<void> {
    const loginPromise = authService.login('demo-human@pmhybrid.local', 'demo1234');
    httpMock
      .expectOne(`${API_BASE_URL}/auth/login`)
      .flush({ accessToken: 'token-1', refreshToken: 'refresh-1' });
    await Promise.resolve();
    httpMock.expectOne(`${API_BASE_URL}/auth/me`).flush({
      id: 'actor-1',
      displayName: 'Demo',
      email: null,
      kind: 'HUMAN',
      avatarUrl: null,
      permissions: [],
    });
    await loginPromise;
    TestBed.tick();
  }

  it('opens no socket while unauthenticated', () => {
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('mints a ticket and opens a ws:// socket to it once authenticated', async () => {
    await login();

    const ticketReq = httpMock.expectOne(`${API_BASE_URL}/realtime/ticket`);
    expect(ticketReq.request.method).toBe('POST');
    ticketReq.flush({ ticket: 'abc123', expiresInMs: 15000 });
    await Promise.resolve();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toBe(
      `${API_BASE_URL.replace(/^http/, 'ws')}/realtime?ticket=abc123`,
    );
  });

  it('bumps notificationsChanged when the socket receives a push', async () => {
    await login();
    httpMock
      .expectOne(`${API_BASE_URL}/realtime/ticket`)
      .flush({ ticket: 'abc123', expiresInMs: 15000 });
    await Promise.resolve();

    expect(realtimeService.notificationsChanged()).toBe(0);
    FakeWebSocket.instances[0].emit('message', {
      data: JSON.stringify({ type: 'notifications.changed' }),
    });

    expect(realtimeService.notificationsChanged()).toBe(1);
  });

  it('reconnects after a delay when the socket closes while still authenticated', async () => {
    vi.useFakeTimers();
    await login();
    httpMock
      .expectOne(`${API_BASE_URL}/realtime/ticket`)
      .flush({ ticket: 'abc123', expiresInMs: 15000 });
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0].emit('close');
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS);

    httpMock
      .expectOne(`${API_BASE_URL}/realtime/ticket`)
      .flush({ ticket: 'xyz789', expiresInMs: 15000 });
    await Promise.resolve();

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1].url).toContain('ticket=xyz789');
  });

  it('closes the socket and does not reconnect after logout', async () => {
    await login();
    httpMock
      .expectOne(`${API_BASE_URL}/realtime/ticket`)
      .flush({ ticket: 'abc123', expiresInMs: 15000 });
    await Promise.resolve();
    const socket = FakeWebSocket.instances[0];

    authService.logout();
    TestBed.tick();

    expect(socket.readyState).toBe(3);
    httpMock.expectNone(`${API_BASE_URL}/realtime/ticket`);
  });
});
