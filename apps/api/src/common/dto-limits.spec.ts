import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateAgentDto } from '../modules/agents/dto/create-agent.dto.js';
import { AuditQueryDto } from '../modules/audit/dto/audit-query.dto.js';
import { LoginDto } from '../modules/auth/dto/login.dto.js';
import { RefreshDto } from '../modules/auth/dto/refresh.dto.js';
import { CreateEpicDto } from '../modules/epics/dto/create-epic.dto.js';
import { BrowseDirectoryQueryDto } from '../modules/git-providers/dto/browse-directory-query.dto.js';
import { CreatePhaseDto } from '../modules/phases/dto/create-phase.dto.js';
import { AddMemberDto } from '../modules/project-members/dto/add-member.dto.js';
import { CreateProjectDto } from '../modules/projects/dto/create-project.dto.js';
import { UpdateProjectDto } from '../modules/projects/dto/update-project.dto.js';
import { AssignRoleDto } from '../modules/roles/dto/assign-role.dto.js';
import { UpdateRolePermissionsDto } from '../modules/roles/dto/update-role-permissions.dto.js';
import { AddDependencyDto } from '../modules/tasks/dto/add-dependency.dto.js';
import { AssignTaskDto } from '../modules/tasks/dto/assign-task.dto.js';
import { CreateTaskCommentDto } from '../modules/tasks/dto/create-task-comment.dto.js';
import { CreateTaskDto } from '../modules/tasks/dto/create-task.dto.js';
import { ListTasksQueryDto } from '../modules/tasks/dto/list-tasks-query.dto.js';
import { UpdateTaskDto } from '../modules/tasks/dto/update-task.dto.js';
import { CreateTemplateDto } from '../modules/templates/dto/create-template.dto.js';
import { CreateUserDto } from '../modules/users/dto/create-user.dto.js';
import { UpdateUserDto } from '../modules/users/dto/update-user.dto.js';
import { WorkloadQueryDto } from '../modules/workload/dto/workload-query.dto.js';
import { LIMITS } from './dto-limits.js';

type Limit = keyof typeof LIMITS;

// [DTO, field, limit] — every request field that carries free text or an identifier.
const FIELDS: [new () => object, string, Limit][] = [
  [CreateAgentDto, 'displayName', 'NAME'],
  [CreateAgentDto, 'providerType', 'LABEL'],
  [CreateAgentDto, 'avatarUrl', 'URL'],
  [AuditQueryDto, 'entityType', 'LABEL'],
  [AuditQueryDto, 'entityId', 'ID'],
  [AuditQueryDto, 'operation', 'LABEL'],
  [AuditQueryDto, 'cursor', 'TOKEN'],
  [LoginDto, 'password', 'PASSWORD'],
  [RefreshDto, 'refreshToken', 'TOKEN'],
  [CreateEpicDto, 'name', 'NAME'],
  [CreateEpicDto, 'description', 'TEXT'],
  [CreateEpicDto, 'phaseId', 'ID'],
  [CreatePhaseDto, 'name', 'NAME'],
  [CreatePhaseDto, 'description', 'TEXT'],
  [CreateTemplateDto, 'name', 'NAME'],
  [CreateTemplateDto, 'description', 'TEXT'],
  [CreateTemplateDto, 'epicId', 'ID'],
  [BrowseDirectoryQueryDto, 'path', 'PATH'],
  [AddMemberDto, 'actorId', 'ID'],
  [CreateProjectDto, 'name', 'NAME'],
  [CreateProjectDto, 'description', 'TEXT'],
  [CreateProjectDto, 'repoUrl', 'URL'],
  [CreateProjectDto, 'docsPath', 'PATH'],
  [UpdateProjectDto, 'leadActorId', 'ID'],
  [UpdateProjectDto, 'name', 'NAME'],
  [UpdateProjectDto, 'docsPath', 'PATH'],
  [AssignRoleDto, 'actorId', 'ID'],
  [AssignRoleDto, 'roleId', 'ID'],
  [AddDependencyDto, 'dependsOnTaskId', 'ID'],
  [AddDependencyDto, 'rawExternalRef', 'LABEL'],
  [AssignTaskDto, 'actorId', 'ID'],
  [CreateTaskCommentDto, 'body', 'COMMENT'],
  [CreateTaskDto, 'title', 'TITLE'],
  [CreateTaskDto, 'acceptanceCriteria', 'CRITERIA'],
  [CreateTaskDto, 'description', 'TEXT'],
  [CreateTaskDto, 'phaseId', 'ID'],
  [CreateTaskDto, 'epicId', 'ID'],
  [CreateTaskDto, 'templateId', 'ID'],
  [CreateTaskDto, 'parentTaskId', 'ID'],
  [UpdateTaskDto, 'title', 'TITLE'],
  [UpdateTaskDto, 'acceptanceCriteria', 'CRITERIA'],
  [CreateUserDto, 'displayName', 'NAME'],
  [CreateUserDto, 'password', 'PASSWORD'],
  [CreateUserDto, 'avatarUrl', 'URL'],
  [UpdateUserDto, 'displayName', 'NAME'],
  [UpdateUserDto, 'avatarUrl', 'URL'],
  [WorkloadQueryDto, 'projectId', 'ID'],
  [WorkloadQueryDto, 'actorId', 'ID'],
  [WorkloadQueryDto, 'phaseId', 'ID'],
  [WorkloadQueryDto, 'epicId', 'ID'],
  [ListTasksQueryDto, 'phaseId', 'ID'],
  [ListTasksQueryDto, 'epicId', 'ID'],
  [ListTasksQueryDto, 'assigneeActorId', 'ID'],
];

async function maxLengthMessage(
  dto: new () => object,
  field: string,
  value: string,
) {
  const errors = await validate(plainToInstance(dto, { [field]: value }));
  return errors.find((error) => error.property === field)?.constraints
    ?.maxLength;
}

describe('request length limits (Roadmap IMPROVEMENT-01b)', () => {
  it.each(FIELDS)(
    '%s.%s refuses more than its limit and names the field',
    async (dto, field, limit) => {
      const message = await maxLengthMessage(
        dto,
        field,
        'a'.repeat(LIMITS[limit] + 1),
      );

      expect(message).toContain(field);
      expect(message).toContain(String(LIMITS[limit]));
    },
  );

  it.each(FIELDS)(
    '%s.%s accepts exactly its limit',
    async (dto, field, limit) => {
      expect(
        await maxLengthMessage(dto, field, 'a'.repeat(LIMITS[limit])),
      ).toBeUndefined();
    },
  );

  it('bounds the email fields at the address limit', async () => {
    const email = `${'a'.repeat(LIMITS.EMAIL)}@example.com`;

    for (const dto of [LoginDto, CreateUserDto, CreateAgentDto]) {
      const errors = await validate(plainToInstance(dto, { email }));
      expect(errors.some((error) => error.property === 'email')).toBe(true);
    }
  });

  it('bounds the list of permission keys and each key', async () => {
    const list = Array.from({ length: LIMITS.LIST + 1 }, () => 'task.write');
    const many = await validate(
      plainToInstance(UpdateRolePermissionsDto, { permissionKeys: list }),
    );
    expect(many.some((error) => error.property === 'permissionKeys')).toBe(
      true,
    );

    const long = await validate(
      plainToInstance(UpdateRolePermissionsDto, {
        permissionKeys: ['a'.repeat(LIMITS.LABEL + 1)],
      }),
    );
    expect(long.some((error) => error.property === 'permissionKeys')).toBe(
      true,
    );
    expect(
      await validate(
        plainToInstance(UpdateRolePermissionsDto, {
          permissionKeys: ['task.write'],
        }),
      ),
    ).toEqual([]);
  });

  it('refuses an invalid enum in the task list query, naming the field', async () => {
    const errors = await validate(
      plainToInstance(ListTasksQueryDto, { status: 'BOGUS' }),
    );

    expect(errors.map((error) => error.property)).toEqual(['status']);
    expect(
      await validate(plainToInstance(ListTasksQueryDto, { status: 'QA' })),
    ).toEqual([]);
    expect(await validate(plainToInstance(ListTasksQueryDto, {}))).toEqual([]);
  });
});
