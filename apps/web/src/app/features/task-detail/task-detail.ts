import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { describeAuditChanges } from '../../core/audit-format.js';
import { AuditEvent, AuditService } from '../../core/audit.service.js';
import { ProjectMember, ProjectsService } from '../../core/projects.service.js';
import { LEGAL_NEXT_STATUSES } from '../../core/task-status-policy.js';
import {
  Task,
  TaskDetail as TaskDetailModel,
  TaskStatus,
  TasksService,
} from '../../core/tasks.service.js';

const HISTORY_LIMIT = 50;

@Component({
  selector: 'app-task-detail',
  imports: [DatePipe, FormsModule, RouterLink, MatButtonModule, MatSelectModule],
  templateUrl: './task-detail.html',
})
export class TaskDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);
  private readonly auditService = inject(AuditService);

  readonly task = signal<TaskDetailModel | null>(null);
  readonly history = signal<AuditEvent[]>([]);
  readonly members = signal<ProjectMember[]>([]);
  readonly otherTasks = signal<Task[]>([]);
  readonly selectedAssigneeId = signal<string | null>(null);
  readonly selectedDependsOnId = signal<string | null>(null);
  readonly newSubtaskTitle = signal('');
  readonly describeChanges = describeAuditChanges;

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

  /** Task and its change history together, so the history always reflects the action just taken (brief §17). */
  private async reload(): Promise<void> {
    const [task, history] = await Promise.all([
      this.tasksService.getById(this.projectId, this.taskId),
      this.auditService.listForProject(this.projectId, {
        entityType: 'Task',
        entityId: this.taskId,
        limit: HISTORY_LIMIT,
      }),
    ]);
    this.task.set(task);
    this.history.set(history);
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
