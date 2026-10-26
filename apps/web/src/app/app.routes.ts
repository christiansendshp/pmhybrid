import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { globalPermissionGuard } from './core/global-permission.guard';
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
        path: 'roles',
        loadComponent: () => import('./features/roles/roles').then((m) => m.RolesPage),
      },
      {
        // The application's own settings (Roadmap GAP-39b): for a holder of the global
        // settings.manage permission, which the API enforces as well.
        path: 'settings',
        canActivate: [globalPermissionGuard],
        data: { globalPermission: 'settings.manage' },
        loadComponent: () => import('./features/settings/settings').then((m) => m.SettingsPage),
      },
      {
        path: 'projects/:projectId',
        canActivate: [projectMemberGuard],
        loadComponent: () =>
          import('./features/project-dashboard/project-dashboard').then((m) => m.ProjectDashboard),
        // Every child below (including ProjectSettings) injects ProjectContext,
        // which only ProjectDashboard provides — keep them nested here, never
        // routed standalone, or DI throws NullInjectorError at runtime.
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'kanban' },
          {
            path: 'kanban',
            loadComponent: () => import('./features/kanban/kanban').then((m) => m.Kanban),
          },
          {
            // The same page as the board, showing the tasks as a table (Roadmap TASK-18).
            path: 'list',
            data: { view: 'list' },
            loadComponent: () => import('./features/kanban/kanban').then((m) => m.Kanban),
          },
          {
            // The tasks waiting for review, as a queue per reviewer (Roadmap TASK-19).
            path: 'review',
            data: { view: 'review' },
            loadComponent: () => import('./features/kanban/kanban').then((m) => m.Kanban),
          },
          {
            // The tasks by agent, with the names no agent answers to (Roadmap TASK-20).
            path: 'agents',
            data: { view: 'agents' },
            loadComponent: () => import('./features/kanban/kanban').then((m) => m.Kanban),
          },
          {
            // What the project waits for, in one list (Roadmap TASK-21).
            path: 'waiting',
            data: { view: 'waiting' },
            loadComponent: () => import('./features/kanban/kanban').then((m) => m.Kanban),
          },
          {
            // What blocks what, and the critical path (Roadmap TASK-22).
            path: 'dependencies',
            data: { view: 'dependencies' },
            loadComponent: () => import('./features/kanban/kanban').then((m) => m.Kanban),
          },
          {
            // The tasks by phase, as the time each was worked on (Roadmap TASK-23).
            path: 'timeline',
            data: { view: 'timeline' },
            loadComponent: () => import('./features/kanban/kanban').then((m) => m.Kanban),
          },
          {
            path: 'progress',
            loadComponent: () =>
              import('./features/phases-progress/phases-progress').then((m) => m.PhasesProgress),
          },
          {
            // How the project moves over time: pace, burn-up and forecast (Roadmap TASK-37).
            path: 'pace',
            loadComponent: () => import('./features/pace/pace').then((m) => m.Pace),
          },
          {
            // What is going wrong: the semaphore, the signals and the critical path (Roadmap TASK-45).
            path: 'risks',
            loadComponent: () => import('./features/risks/risks').then((m) => m.Risks),
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
          {
            path: 'settings',
            loadComponent: () =>
              import('./features/project-settings/project-settings').then((m) => m.ProjectSettings),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
