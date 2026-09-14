import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { projectMemberGuard } from './core/project-member.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'projects' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'projects',
    canActivate: [authGuard],
    loadComponent: () => import('./features/my-projects/my-projects').then((m) => m.MyProjects),
  },
  {
    path: 'projects/:projectId',
    canActivate: [authGuard, projectMemberGuard],
    loadComponent: () =>
      import('./features/project-dashboard/project-dashboard').then((m) => m.ProjectDashboard),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'kanban' },
      {
        path: 'kanban',
        loadComponent: () => import('./features/kanban/kanban').then((m) => m.Kanban),
      },
      {
        path: 'progress',
        loadComponent: () =>
          import('./features/phases-progress/phases-progress').then((m) => m.PhasesProgress),
      },
      {
        path: 'tasks/:taskId',
        loadComponent: () => import('./features/task-detail/task-detail').then((m) => m.TaskDetail),
      },
      {
        path: 'workload',
        loadComponent: () => import('./features/workload/workload').then((m) => m.Workload),
      },
      {
        path: 'documents',
        loadComponent: () =>
          import('./features/documents-viewer/documents-viewer').then((m) => m.DocumentsViewer),
      },
      {
        path: 'conflicts',
        loadComponent: () => import('./features/conflicts/conflicts').then((m) => m.Conflicts),
      },
    ],
  },
  { path: '**', redirectTo: 'projects' },
];
