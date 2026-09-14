import { CanActivateFn } from '@angular/router';

/**
 * Stub for FASE-05. Will verify the current actor has a ProjectMember row
 * for the :projectId route param before allowing entry into a project.
 */
export const projectMemberGuard: CanActivateFn = () => {
  return true;
};
