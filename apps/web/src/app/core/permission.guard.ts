import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { ProjectsService } from './projects.service.js';

/**
 * Reads a required permission key from route data (`data: { permission:
 * 'project.update' }`). No `permission` in route data = no check (route
 * didn't opt in), same "absent = allow" convention as the Nest-side
 * PermissionGuard. The server enforces this authoritatively regardless —
 * this only spares the user a doomed round trip.
 */
export const permissionGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  const required = route.data['permission'] as string | undefined;
  if (!required) {
    return true;
  }

  const projectId = route.paramMap.get('projectId');
  if (!projectId) {
    return true;
  }

  const projectsService = inject(ProjectsService);
  try {
    const permissions = await projectsService.myPermissions(projectId);
    return permissions.includes(required);
  } catch {
    return false;
  }
};
