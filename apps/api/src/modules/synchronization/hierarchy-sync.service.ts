import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService, diffFields } from '../audit/audit.service.js';
import {
  isStructuralEntry,
  reachesTask,
  resolvePlacements,
  type Placement,
} from '../roadmap/roadmap-hierarchy.util.js';
import type {
  ParsedRoadmapRow,
  StructureEntry,
} from '../roadmap/roadmap-parser.service.js';

/** What a sync run counts of the hierarchy (Roadmap GAP-35d). */
export interface HierarchySummary {
  /** Phases and epics made from a PHASE or EPIC entry, or renamed or moved to follow one. */
  structureSynced: number;
  /** Tasks whose parent task, epic or phase was set to what the document says. */
  placementsChanged: number;
  /** Tasks a PHASE or EPIC entry had become before those were kept as phases and epics, removed. */
  structuralTasksRetired: number;
}

type LiveTask = Prisma.TaskGetPayload<object>;

/** What the hierarchy needs of a row of the document or of a heading of its Plan section. */
type Entry = Pick<
  ParsedRoadmapRow,
  'externalId' | 'entryType' | 'outcome' | 'parentRef'
>;

/**
 * The hierarchy of a YAML Roadmap (Roadmap GAP-35d): a PHASE or EPIC entry is a
 * Phase or an Epic, identified by the id of its entry, and every other entry
 * sits where its `parent` chain says — a subtask of its parent when that is
 * work, else in its epic and phase.
 *
 * The document owns this structure wherever it states it: a task whose entry
 * names a parent is placed there on every run, and one whose entry names none
 * is left as it is. No conflict is raised for it; a move is recorded as a
 * `ROADMAP_FIELD_UPDATE` with what it was and what it became. (A placement made
 * in PM Hub is written into the entry when it can be — `docs/synchronization.md`
 * — so the two agree, and the document is the tie-breaker when it could not be.)
 */
@Injectable()
export class HierarchySyncService {
  constructor(private readonly audit: AuditService) {}

  /**
   * Removes the task a PHASE or EPIC entry had become before those were kept as
   * phases and epics, so the entry is not counted, and shown on the board, as
   * work. Soft delete, like any removal: it stays in the history.
   */
  async retireStructuralTask(
    tx: Prisma.TransactionClient,
    task: LiveTask,
    summary: HierarchySummary,
  ): Promise<void> {
    if (task.deletedAt) {
      return;
    }
    const deletedAt = new Date();
    await tx.taskDependency.deleteMany({
      where: { OR: [{ taskId: task.id }, { dependsOnTaskId: task.id }] },
    });
    await tx.taskAssignment.updateMany({
      where: { taskId: task.id, unassignedAt: null },
      data: { unassignedAt: deletedAt },
    });
    // Its subtasks (made in the app) would otherwise hang from a task nobody
    // counts, and drop out of the progress with it; the placement below puts
    // them where the document says.
    await tx.task.updateMany({
      where: { parentTaskId: task.id },
      data: { parentTaskId: null },
    });
    await tx.task.update({ where: { id: task.id }, data: { deletedAt } });
    await this.audit.record(
      {
        projectId: task.projectId,
        entityType: 'Task',
        entityId: task.id,
        operation: 'DELETE',
        origin: 'SYNC',
        previousValue: {
          externalId: task.externalId,
          title: task.title,
          status: task.status,
        },
        newValue: { reason: 'the entry is a phase or an epic' },
      },
      tx,
    );
    summary.structuralTasksRetired += 1;
  }

  /** Brings the phases, the epics and the placement of every task in line with the document. */
  async reconcile(
    tx: Prisma.TransactionClient,
    projectId: string,
    rows: readonly ParsedRoadmapRow[],
    structure: readonly StructureEntry[],
    tasksByExternalId: ReadonlyMap<string, LiveTask>,
    summary: HierarchySummary,
  ): Promise<void> {
    // A document says its hierarchy with typed entries (YAML) or with the
    // headings of its Plan section (the skill's tables); the older tables say
    // none of it.
    const entries: readonly Entry[] = [...rows, ...structure];
    if (!entries.some((entry) => entry.entryType !== undefined)) {
      return;
    }
    const placements = resolvePlacements(
      entries.map((entry) => ({
        externalId: entry.externalId,
        entryType: entry.entryType,
        parentRef: entry.parentRef,
      })),
    );
    const phaseIds = await this.syncPhases(
      tx,
      projectId,
      entries.filter((entry) => entry.entryType === 'PHASE'),
      summary,
    );
    const epicIds = await this.syncEpics(
      tx,
      projectId,
      entries.filter((entry) => entry.entryType === 'EPIC'),
      placements,
      phaseIds,
      summary,
    );
    await this.placeTasks(
      tx,
      projectId,
      rows,
      placements,
      tasksByExternalId,
      phaseIds,
      epicIds,
      summary,
    );
  }

  /** The ids of the project's phases by entry id, after creating or renaming those the document names. */
  private async syncPhases(
    tx: Prisma.TransactionClient,
    projectId: string,
    entries: readonly Entry[],
    summary: HierarchySummary,
  ): Promise<Map<string, string>> {
    const known = new Map(
      (
        await tx.phase.findMany({
          where: { projectId, externalId: { not: null } },
        })
      ).map((phase) => [phase.externalId!, phase]),
    );
    const ids = new Map([...known].map(([key, phase]) => [key, phase.id]));
    let order =
      (
        await tx.phase.aggregate({
          where: { projectId },
          _max: { order: true },
        })
      )._max.order ?? 0;
    for (const entry of entries) {
      const name = entry.outcome ?? entry.externalId;
      const phase = known.get(entry.externalId);
      if (!phase) {
        order += 1;
        const created = await tx.phase.create({
          data: { projectId, externalId: entry.externalId, name, order },
        });
        ids.set(entry.externalId, created.id);
        await this.audit.record(
          {
            projectId,
            entityType: 'Phase',
            entityId: created.id,
            operation: 'CREATE',
            origin: 'ROADMAP',
            newValue: { externalId: entry.externalId, name },
          },
          tx,
        );
        summary.structureSynced += 1;
      } else if (phase.name !== name) {
        await tx.phase.update({ where: { id: phase.id }, data: { name } });
        await this.audit.record(
          {
            projectId,
            entityType: 'Phase',
            entityId: phase.id,
            operation: 'UPDATE',
            origin: 'ROADMAP',
            previousValue: { name: phase.name },
            newValue: { name },
          },
          tx,
        );
        summary.structureSynced += 1;
      }
    }
    return ids;
  }

  /** The ids of the project's epics by entry id, after creating, renaming or moving to a phase those the document names. */
  private async syncEpics(
    tx: Prisma.TransactionClient,
    projectId: string,
    entries: readonly Entry[],
    placements: ReadonlyMap<string, Placement>,
    phaseIds: ReadonlyMap<string, string>,
    summary: HierarchySummary,
  ): Promise<Map<string, string>> {
    const known = new Map(
      (
        await tx.epic.findMany({
          where: { projectId, externalId: { not: null } },
        })
      ).map((epic) => [epic.externalId!, epic]),
    );
    const ids = new Map([...known].map(([key, epic]) => [key, epic.id]));
    let order =
      (await tx.epic.aggregate({ where: { projectId }, _max: { order: true } }))
        ._max.order ?? 0;
    for (const entry of entries) {
      const name = entry.outcome ?? entry.externalId;
      // Undefined: the document names no phase for it, which changes nothing.
      const phaseEntry = placements.get(entry.externalId)?.phase;
      const phaseId = phaseEntry ? phaseIds.get(phaseEntry) : undefined;
      const epic = known.get(entry.externalId);
      if (!epic) {
        order += 1;
        const created = await tx.epic.create({
          data: {
            projectId,
            externalId: entry.externalId,
            name,
            order,
            phaseId: phaseId ?? null,
          },
        });
        ids.set(entry.externalId, created.id);
        await this.audit.record(
          {
            projectId,
            entityType: 'Epic',
            entityId: created.id,
            operation: 'CREATE',
            origin: 'ROADMAP',
            newValue: {
              externalId: entry.externalId,
              name,
              phaseId: phaseId ?? null,
            },
          },
          tx,
        );
        summary.structureSynced += 1;
        continue;
      }
      const diff = diffFields(
        { name: epic.name, phaseId: epic.phaseId },
        {
          name,
          ...(phaseId !== undefined ? { phaseId } : {}),
        },
      );
      if (diff) {
        await tx.epic.update({
          where: { id: epic.id },
          data: diff.newValue,
        });
        await this.audit.record(
          {
            projectId,
            entityType: 'Epic',
            entityId: epic.id,
            operation: 'UPDATE',
            origin: 'ROADMAP',
            ...diff,
          },
          tx,
        );
        summary.structureSynced += 1;
      }
    }
    return ids;
  }

  private async placeTasks(
    tx: Prisma.TransactionClient,
    projectId: string,
    rows: readonly ParsedRoadmapRow[],
    placements: ReadonlyMap<string, Placement>,
    tasksByExternalId: ReadonlyMap<string, LiveTask>,
    phaseIds: ReadonlyMap<string, string>,
    epicIds: ReadonlyMap<string, string>,
    summary: HierarchySummary,
  ): Promise<void> {
    // Every live task's parent, kept current as tasks are moved, so that a
    // placement that would make a task its own ancestor is refused whatever
    // the tasks in between are (some may not be in the document at all).
    const parentOf = new Map(
      (
        await tx.task.findMany({
          where: { projectId, deletedAt: null },
          select: { id: true, parentTaskId: true },
        })
      ).map((task) => [task.id, task.parentTaskId]),
    );
    for (const row of rows) {
      const placement = placements.get(row.externalId);
      const task = tasksByExternalId.get(row.externalId);
      if (!placement || !task || task.deletedAt || isStructuralEntry(row)) {
        continue;
      }
      const parent = placement.parentTask
        ? tasksByExternalId.get(placement.parentTask)
        : undefined;
      const epicId = placement.epic ? epicIds.get(placement.epic) : undefined;
      const phaseId = placement.phase
        ? phaseIds.get(placement.phase)
        : undefined;
      // A part of the chain PM Hub has nothing for (its parent task was
      // removed, say): the document names something that cannot be linked.
      if (
        (placement.parentTask && (!parent || parent.deletedAt)) ||
        (placement.epic && !epicId) ||
        (placement.phase && !phaseId)
      ) {
        continue;
      }
      const desired = {
        parentTaskId: parent?.id ?? null,
        epicId: epicId ?? null,
        phaseId: phaseId ?? null,
      };
      const diff = diffFields(
        {
          parentTaskId: task.parentTaskId,
          epicId: task.epicId,
          phaseId: task.phaseId,
        },
        desired,
      );
      if (!diff) {
        continue;
      }
      if (
        desired.parentTaskId &&
        reachesTask(parentOf, desired.parentTaskId, task.id)
      ) {
        continue; // a loop through tasks the document does not list
      }
      await tx.task.update({ where: { id: task.id }, data: desired });
      await this.audit.record(
        {
          projectId,
          entityType: 'Task',
          entityId: task.id,
          operation: 'ROADMAP_FIELD_UPDATE',
          origin: 'ROADMAP',
          ...diff,
        },
        tx,
      );
      task.parentTaskId = desired.parentTaskId;
      task.epicId = desired.epicId;
      task.phaseId = desired.phaseId;
      parentOf.set(task.id, desired.parentTaskId);
      summary.placementsChanged += 1;
    }
  }
}
