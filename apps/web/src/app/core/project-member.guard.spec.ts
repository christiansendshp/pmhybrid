import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree, convertToParamMap } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectMemberGuard } from './project-member.guard.js';
import { ProjectsService } from './projects.service.js';

/** The API is authoritative; this guard only avoids flashing a project a person cannot open (Roadmap TEST-01c). */
describe('projectMemberGuard', () => {
  let getById: ReturnType<typeof vi.fn>;
  let createUrlTree: ReturnType<typeof vi.fn>;
  const projectsTree = {} as UrlTree;

  beforeEach(() => {
    getById = vi.fn();
    createUrlTree = vi.fn().mockReturnValue(projectsTree);
    TestBed.configureTestingModule({
      providers: [
        { provide: ProjectsService, useValue: { getById } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });
  });

  function run(params: Record<string, string>) {
    const route = { paramMap: convertToParamMap(params) } as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => projectMemberGuard(route, {} as never));
  }

  it('lets a member in: the project can be read', async () => {
    getById.mockResolvedValue({ id: 'p1' });

    await expect(run({ projectId: 'p1' })).resolves.toBe(true);
    expect(getById).toHaveBeenCalledWith('p1');
    expect(createUrlTree).not.toHaveBeenCalled();
  });

  it('sends a non-member (the API refuses the project) back to the list of projects', async () => {
    getById.mockRejectedValue(new Error('403'));

    await expect(run({ projectId: 'p1' })).resolves.toBe(projectsTree);
    expect(createUrlTree).toHaveBeenCalledWith(['/projects']);
  });

  it('sends a route without a project id back to the list, without asking the API', async () => {
    await expect(run({})).resolves.toBe(projectsTree);
    expect(getById).not.toHaveBeenCalled();
    expect(createUrlTree).toHaveBeenCalledWith(['/projects']);
  });
});
