import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  LlmConnectionTestResult,
  LlmProviderKey,
  LlmSettingsView,
} from '@pmhybrid/shared-types';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export type { LlmConnectionTestResult, LlmProviderKey, LlmSettingsView };

/** What a save may carry (Roadmap GAP-39b). Every field is optional; `apiKey` goes only when it is to be replaced, and nothing the API answers ever carries it back. */
export interface UpdateLlmSettingsBody {
  provider?: LlmProviderKey;
  model?: string;
  enabled?: boolean;
  apiKey?: string;
  /** null clears it: the provider's own default applies. */
  temperature?: number | null;
  timeoutMs?: number;
  maxTokens?: number;
}

/** The instance's LLM configuration (Roadmap GAP-39): every call needs the global `settings.manage` permission. */
@Injectable({ providedIn: 'root' })
export class LlmSettingsService {
  private readonly http = inject(HttpClient);

  get(): Promise<LlmSettingsView> {
    return firstValueFrom(this.http.get<LlmSettingsView>(`${API_BASE_URL}/settings/llm`));
  }

  update(body: UpdateLlmSettingsBody): Promise<LlmSettingsView> {
    return firstValueFrom(this.http.put<LlmSettingsView>(`${API_BASE_URL}/settings/llm`, body));
  }

  /** Forgets the stored key, which also switches the integration off. */
  removeApiKey(): Promise<LlmSettingsView> {
    return firstValueFrom(
      this.http.delete<LlmSettingsView>(`${API_BASE_URL}/settings/llm/api-key`),
    );
  }

  /** A minimal real call with the stored configuration; the answer says whether it worked and, if not, why (already without the key). */
  test(): Promise<LlmConnectionTestResult> {
    return firstValueFrom(
      this.http.post<LlmConnectionTestResult>(`${API_BASE_URL}/settings/llm/test`, {}),
    );
  }
}
