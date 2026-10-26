/**
 * Emitted once a write of tasks in the app has committed (`WriteBackService.inTransaction`), with `{ projectId }`:
 * what is derived from the tasks (a phase that is now complete) listens to it instead of every place that writes
 * one (Roadmap TASK-41). The other trigger is the synchronization's own `sync.completed`.
 */
export const TASKS_WRITTEN_EVENT = 'project.tasks-written';
