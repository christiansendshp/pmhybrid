import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { projectMemberGuard } from './core/project-member.guard';
import { AppShell } from './layout/app-shell/app-shell';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    // Every signed-in page renders inside the one shell (brief §21). The guard runs on
    // each child navigation, as it did when every route declared it on its own.
    path: '',
    component: AppShell,
    canActivateChild: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'projects',
        loadComponent: () => import('./features/my-projects/my-projects').then((m) => m.MyProjects),
      },
      {
        path: 'workload',
        loadComponent: () => import('./features/workload/workload').then((m) => m.Workload),
      },
      {
        path: 'team',
        loadComponent: () => import('./features/team/team').then((m) => m.Team),
      },
      {
        path: 'projects/:projectId',
        canActivate: [projectMemberGuard],
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
            loadComponent: () =>
              import('./features/task-detail/task-detail').then((m) => m.TaskDetail),
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
          {
            path: 'audit',
            loadComponent: () => import('./features/audit-log/audit-log').then((m) => m.AuditLog),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
