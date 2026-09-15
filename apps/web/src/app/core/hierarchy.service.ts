import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url.js';

export interface Phase {
  id: string;
  projectId: string;
  name: string;
  order: number;
  description: string | null;
  status: string | null;
}

export interface Epic {
  id: string;
  projectId: string;
  phaseId: string | null;
  name: string;
  order: number;
  description: string | null;
  status: string | null;
}

export interface Template {
  id: string;
  projectId: string;
  epicId: string | null;
  name: string;
  order: number;
  description: string | null;
}

/** The optional Phase → Epic → Template rungs a task can hang from (brief §5). */
export interface ProjectHierarchy {
  phases: Phase[];
  epics: Epic[];
  templates: Template[];
}

export const EMPTY_HIERARCHY: ProjectHierarchy = { phases: [], epics: [], templates: [] };

@Injectable({ providedIn: 'root' })
export class HierarchyService {
  private readonly http = inject(HttpClient);

  async load(projectId: string): Promise<ProjectHierarchy> {
    const base = `${API_BASE_URL}/projects/${projectId}`;
    const [phases, epics, templates] = await Promise.all([
      firstValueFrom(this.http.get<Phase[]>(`${base}/phases`)),
      firstValueFrom(this.http.get<Epic[]>(`${base}/epics`)),
      firstValueFrom(this.http.get<Template[]>(`${base}/templates`)),
    ]);
    return { phases, epics, templates };
  }
}
