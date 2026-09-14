import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export interface CurrentActor {
  id: string;
  displayName: string;
  email: string | null;
  kind: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ADR-006 (docs/Stack_Tecnologies.md): access token in memory only (Signal,
// never persisted); refresh token in localStorage so a reload can silently
// re-authenticate via /auth/refresh instead of forcing a fresh login.
const REFRESH_TOKEN_STORAGE_KEY = 'pmhybrid.refreshToken';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly accessTokenSignal = signal<string | null>(null);
  readonly currentActor = signal<CurrentActor | null>(null);
  readonly isAuthenticated = computed(() => this.accessTokenSignal() !== null);

  accessToken(): string | null {
    return this.accessTokenSignal();
  }

  async login(email: string, password: string): Promise<void> {
    const tokens = await firstValueFrom(
      this.http.post<TokenPair>(`${API_BASE_URL}/auth/login`, { email, password }),
    );
    this.storeTokens(tokens);
    await this.loadCurrentActor();
  }

  /** Attempts a silent re-auth from the stored refresh token. Never throws. */
  async refresh(): Promise<boolean> {
    const refreshToken = this.readStoredRefreshToken();
    if (!refreshToken) {
      return false;
    }
    try {
      const { accessToken } = await firstValueFrom(
        this.http.post<{ accessToken: string }>(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        }),
      );
      this.accessTokenSignal.set(accessToken);
      if (!this.currentActor()) {
        await this.loadCurrentActor();
      }
      return true;
    } catch {
      this.logout();
      return false;
    }
  }

  logout(): void {
    this.accessTokenSignal.set(null);
    this.currentActor.set(null);
    this.clearStoredRefreshToken();
  }

  private async loadCurrentActor(): Promise<void> {
    const actor = await firstValueFrom(this.http.get<CurrentActor>(`${API_BASE_URL}/auth/me`));
    this.currentActor.set(actor);
  }

  private storeTokens(tokens: TokenPair): void {
    this.accessTokenSignal.set(tokens.accessToken);
    try {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken);
    } catch {
      // Private browsing / storage disabled — refresh-on-reload just won't work.
    }
  }

  private readStoredRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private clearStoredRefreshToken(): void {
    try {
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    } catch {
      // Nothing to clear if storage isn't available.
    }
  }
}
