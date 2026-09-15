import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

/** Never carries the secret — the API only returns it once, from create(). */
export interface ApiKey {
  id: string;
  name: string | null;
  prefix: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface CreatedApiKey extends ApiKey {
  /** The plaintext key. Shown exactly once; the API cannot return it again. */
  key: string;
}

/** Controlled API access for AI agents (brief §27, §28, Roadmap GAP-15). */
@Injectable({ providedIn: 'root' })
export class ApiKeysService {
  private readonly http = inject(HttpClient);

  list(agentId: string): Promise<ApiKey[]> {
    return firstValueFrom(this.http.get<ApiKey[]>(`${API_BASE_URL}/agents/${agentId}/keys`));
  }

  create(agentId: string, name?: string): Promise<CreatedApiKey> {
    return firstValueFrom(
      this.http.post<CreatedApiKey>(`${API_BASE_URL}/agents/${agentId}/keys`, name ? { name } : {}),
    );
  }

  revoke(agentId: string, keyId: string): Promise<ApiKey> {
    return firstValueFrom(
      this.http.delete<ApiKey>(`${API_BASE_URL}/agents/${agentId}/keys/${keyId}`),
    );
  }
}
