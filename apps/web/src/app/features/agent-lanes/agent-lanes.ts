import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgentLane, UnregisteredName, agentLanes } from '../../core/agent-lanes.js';
import { statusLabel } from '../../core/task-status-policy.js';
import { elapsedText } from '../../core/stage-age.js';
import { ProjectMember } from '../../core/projects.service.js';
import { TaskCard, TaskStatus } from '../../core/tasks.service.js';
import { wipRatio } from '../../core/wip.js';
import { ShortTitlePipe } from '../../shared/short-title.pipe.js';

const STATUSES: readonly TaskStatus[] = [
  'PENDIENTE',
  'ASIGNADA',
  'EN_DESARROLLO',
  'QA',
  'TERMINADA',
];

/**
 * The tasks by agent (Roadmap TASK-20): one lane for every agent of the project, the idle ones included, with
 * its tasks by stage and its work in development against the limit per agent; and the names the ledger and
 * the Roadmap carry that no registered agent answers to, each with how often, so who is working without being
 * known is as visible as who is known. It reads what the board and the workload already read (the tasks and
 * the members) and, besides, the names no agent answers to.
 */
@Component({
  selector: 'app-agent-lanes',
  imports: [RouterLink, ShortTitlePipe],
  templateUrl: './agent-lanes.html',
  styleUrl: './agent-lanes.scss',
})
export class AgentLanes {
  /** The tasks the filters keep. */
  readonly cards = input.required<TaskCard[]>();
  /** Every task of the project, for the work in development an agent really has. */
  readonly allCards = input.required<TaskCard[]>();
  readonly members = input.required<ProjectMember[]>();
  readonly agentLimit = input<number | null>(null);
  readonly unregistered = input<UnregisteredName[]>([]);
  /** The list of names could not be read: said, so its absence is not taken for "none". */
  readonly unregisteredFailed = input(false);

  readonly result = computed(() =>
    agentLanes(this.cards(), this.members(), this.agentLimit(), this.allCards()),
  );

  readonly statuses = STATUSES;
  readonly statusLabel = statusLabel;
  readonly wipRatio = wipRatio;
  readonly waited = (card: TaskCard) => elapsedText(card.statusChangedAt);
  readonly reasonText = (reason: UnregisteredName['reason']) =>
    reason === 'AMBIGUOUS'
      ? 'dos agentes responden a este nombre'
      : 'ningún agente responde a este nombre';

  trackLane(lane: AgentLane): string {
    return lane.actorId;
  }
}
