import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { RealtimeMessage } from '@pmhybrid/shared-types';
import { API_BASE_URL } from './api-base-url.js';
import { AuthService } from './auth.service.js';

export const RECONNECT_DELAY_MS = 3000;

/**
 * Live push for notifications (Roadmap GAP-26). A WebSocket upgrade request
 * can't carry the `Authorization` header the in-memory access-token Signal
 * (ADR-006) would otherwise supply, so this mints a short-lived ticket over
 * the normal authenticated HTTP client first, then opens the socket with it
 * — see `apps/api/src/modules/realtime/realtime-ticket.service.ts`.
 *
 * Pushes carry no notification content, only a "something changed" signal
 * (`notificationsChanged`, an ever-incrementing counter a consumer can
 * watch with `effect()`) — the REST list stays the one source of truth for
 * shape, so there is no second payload format to keep in sync.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  readonly notificationsChanged = signal(0);

  private readonly authEffect = effect(() => {
    if (this.authService.isAuthenticated()) {
      void this.connect();
    } else {
      this.disconnect();
    }
  });

  private async connect(): Promise<void> {
    if (this.socket) {
      return;
    }
    let ticket: string;
    try {
      const response = await firstValueFrom(
        this.http.post<{ ticket: string }>(`${API_BASE_URL}/realtime/ticket`, {}),
      );
      ticket = response.ticket;
    } catch {
      this.scheduleReconnect();
      return;
    }

    const wsUrl = `${API_BASE_URL.replace(/^http/, 'ws')}/realtime?ticket=${ticket}`;
    const socket = new WebSocket(wsUrl);
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data as string) as RealtimeMessage;
      if (message.type === 'notifications.changed') {
        this.notificationsChanged.update((count) => count + 1);
      }
    });
    socket.addEventListener('close', () => {
      this.socket = null;
      if (this.authService.isAuthenticated()) {
        this.scheduleReconnect();
      }
    });
    socket.addEventListener('error', () => socket.close());
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.authService.isAuthenticated()) {
        void this.connect();
      }
    }, RECONNECT_DELAY_MS);
  }
}
