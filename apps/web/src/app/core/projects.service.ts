import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  docsPath: string;
  syncIntervalMinutes: number;
  progressRollupStrategy: string;
  status: string;
  createdAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  repoUrl?: string;
  docsPath: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  actorId: string;
  joinedAt: string;
  isActive: boolean;
  actor: { id: string; displayName: string; kind: 'HUMAN' | 'AI_AGENT'; email: string | null };
}

export interface Actor {
  id: string;
  displayName: string;
  email: string | null;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly http = inject(HttpClient);

  listMine(): Promise<Project[]> {
    return firstValueFrom(this.http.get<Project[]>(`${API_BASE_URL}/projects`));
  }

  getById(projectId: string): Promise<Project> {
    return firstValueFrom(this.http.get<Project>(`${API_BASE_URL}/projects/${projectId}`));
  }

  create(input: CreateProjectInput): Promise<Project> {
    return firstValueFrom(this.http.post<Project>(`${API_BASE_URL}/projects`, input));
  }

  listMembers(projectId: string): Promise<ProjectMember[]> {
    return firstValueFrom(
      this.http.get<ProjectMember[]>(`${API_BASE_URL}/projects/${projectId}/members`),
    );
  }

  addMember(projectId: string, actorId: string): Promise<ProjectMember> {
    return firstValueFrom(
      this.http.post<ProjectMember>(`${API_BASE_URL}/projects/${projectId}/members`, { actorId }),
    );
  }

  removeMember(projectId: string, actorId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${API_BASE_URL}/projects/${projectId}/members/${actorId}`),
    );
  }

  myPermissions(projectId: string): Promise<string[]> {
    return firstValueFrom(
      this.http.get<string[]>(`${API_BASE_URL}/projects/${projectId}/roles/my-permissions`),
    );
  }

  listUsers(): Promise<Actor[]> {
    return firstValueFrom(this.http.get<Actor[]>(`${API_BASE_URL}/users`));
  }

  listAgents(): Promise<Actor[]> {
    return firstValueFrom(this.http.get<Actor[]>(`${API_BASE_URL}/agents`));
  }
}
