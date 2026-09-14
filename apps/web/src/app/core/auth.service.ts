import { Injectable, signal } from '@angular/core';

export interface CurrentActor {
  id: string;
  displayName: string;
}

/**
 * Stub for FASE-04. Holds auth state as a signal; real login/JWT wiring
 * lands with the Auth module (docs/architecture.md).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentActor = signal<CurrentActor | null>(null);

  isAuthenticated(): boolean {
    return this.currentActor() !== null;
  }
}
