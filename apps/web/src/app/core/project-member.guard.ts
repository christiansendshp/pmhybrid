import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { ProjectsService } from './projects.service.js';

/**
 * FASE-05: the server (ProjectMemberGuard, Nest side) is authoritative —
 * this guard just avoids flashing project content before a 403 arrives.
 * GET /projects/:projectId already 403s for a non-member; we probe it here.
 */
export const projectMemberGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  const projectsService = inject(ProjectsService);
  const router = inject(Router);

  const projectId = route.paramMap.get('projectId');
  if (!projectId) {
    return router.createUrlTree(['/projects']);
  }

  try {
    await projectsService.getById(projectId);
    return true;
  } catch {
    return router.createUrlTree(['/projects']);
  }
};
