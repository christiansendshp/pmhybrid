import { Injectable, signal } from '@angular/core';
import { Project } from './projects.service.js';

/**
 * The open project, shared by its header and the sections routed inside it.
 * Provided by ProjectDashboard, so each project page gets its own instance
 * and a change made in one section (a rename in Settings) shows in the header.
 */
@Injectable()
export class ProjectContext {
  readonly project = signal<Project | null>(null);
  /** The requester's permissions in this project; the API enforces them regardless. */
  readonly permissions = signal<string[]>([]);
}
