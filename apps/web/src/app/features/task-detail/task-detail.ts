import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { ProjectMember, ProjectsService } from '../../core/projects.service.js';
import {
  Task,
  TaskDetail as TaskDetailModel,
  TaskStatus,
  TasksService,
} from '../../core/tasks.service.js';

/** Mirrors apps/api/src/modules/tasks/task-status-policy.ts — which buttons are legal to show. */
const LEGAL_NEXT_STATUSES: Record<TaskStatus, TaskStatus[]> = {
  PENDIENTE: ['ASIGNADA'],
  ASIGNADA: ['PENDIENTE', 'EN_DESARROLLO'],
  EN_DESARROLLO: ['QA', 'ASIGNADA'],
  QA: ['TERMINADA', 'EN_DESARROLLO'],
  TERMINADA: ['EN_DESARROLLO', 'QA'],
};

@Component({
  selector: 'app-task-detail',
  imports: [FormsModule, RouterLink, MatButtonModule, MatSelectModule],
  templateUrl: './task-detail.html',
})
export class TaskDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);

  readonly task = signal<TaskDetailModel | null>(null);
  readonly members = signal<ProjectMember[]>([]);
  readonly otherTasks = signal<Task[]>([]);
  readonly selectedAssigneeId = signal<string | null>(null);
  readonly selectedDependsOnId = signal<string | null>(null);
  readonly newSubtaskTitle = signal('');

  private get projectId(): string {
    return this.route.parent!.snapshot.paramMap.get('projectId')!;
  }

  private get taskId(): string {
    return this.route.snapshot.paramMap.get('taskId')!;
  }

  legalNextStatuses(): TaskStatus[] {
    const current = this.task()?.status;
    return current ? LEGAL_NEXT_STATUSES[current] : [];
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
    const [members, allTasks] = await Promise.all([
      this.projectsService.listMembers(this.projectId),
      this.tasksService.listForProject(this.projectId),
    ]);
    this.members.set(members);
    this.otherTasks.set(allTasks.filter((t) => t.id !== this.taskId));
  }

  private async reload(): Promise<void> {
    this.task.set(await this.tasksService.getById(this.projectId, this.taskId));
  }

  async transition(status: TaskStatus): Promise<void> {
    await this.tasksService.transition(this.projectId, this.taskId, status);
    await this.reload();
  }

  async assign(): Promise<void> {
    const actorId = this.selectedAssigneeId();
    if (!actorId) {
      return;
    }
    await this.tasksService.assign(this.projectId, this.taskId, actorId);
    this.selectedAssigneeId.set(null);
    await this.reload();
  }

  async addDependency(): Promise<void> {
    const dependsOnTaskId = this.selectedDependsOnId();
    if (!dependsOnTaskId) {
      return;
    }
    await this.tasksService.addDependency(this.projectId, this.taskId, dependsOnTaskId);
    this.selectedDependsOnId.set(null);
    await this.reload();
  }

  async addSubtask(): Promise<void> {
    const title = this.newSubtaskTitle().trim();
    if (!title) {
      return;
    }
    await this.tasksService.create(this.projectId, { title, parentTaskId: this.taskId });
    this.newSubtaskTitle.set('');
    await this.reload();
  }
}
