import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export type ActorKind = 'HUMAN' | 'AI_AGENT';

export interface Actor {
  id: string;
  kind: ActorKind;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
  /** AI agents only. */
  agentProfile?: { providerType: string; configJson: Record<string, unknown> | null } | null;
}

export interface CreateUserInput {
  displayName: string;
  email: string;
  password: string;
  avatarUrl?: string;
}

export interface CreateAgentInput {
  displayName: string;
  providerType: string;
  email?: string;
  avatarUrl?: string;
  config?: Record<string, unknown>;
}

/** `providerType`/`config` only apply to AI agents. */
export interface UpdateActorInput {
  displayName?: string;
  avatarUrl?: string;
  isActive?: boolean;
  providerType?: string;
  config?: Record<string, unknown>;
}

/** Humans and AI agents (brief §3) — mirrors apps/api's users and agents modules. */
@Injectable({ providedIn: 'root' })
export class ActorsService {
  private readonly http = inject(HttpClient);

  listUsers(): Promise<Actor[]> {
    return firstValueFrom(this.http.get<Actor[]>(`${API_BASE_URL}/users`));
  }

  listAgents(): Promise<Actor[]> {
    return firstValueFrom(this.http.get<Actor[]>(`${API_BASE_URL}/agents`));
  }

  createUser(input: CreateUserInput): Promise<Actor> {
    return firstValueFrom(this.http.post<Actor>(`${API_BASE_URL}/users`, input));
  }

  createAgent(input: CreateAgentInput): Promise<Actor> {
    return firstValueFrom(this.http.post<Actor>(`${API_BASE_URL}/agents`, input));
  }

  update(actor: Pick<Actor, 'id' | 'kind'>, input: UpdateActorInput): Promise<Actor> {
    const resource = actor.kind === 'AI_AGENT' ? 'agents' : 'users';
    return firstValueFrom(this.http.patch<Actor>(`${API_BASE_URL}/${resource}/${actor.id}`, input));
  }
}
