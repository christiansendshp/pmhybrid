import { statusLabel } from './task-status-policy.js';
import { TaskStatus } from './tasks.service.js';

/**
 * Whether the stage the ledger's latest entry gives a task and the task's status disagree
 * (Roadmap TASK-14): the ledger is ahead of the sync, a move in PM Hub the documents lack, or a
 * ledger that closed what the row still keeps open. A task whose ledger says nothing about its
 * stage never disagrees.
 *
 * A start (`IN_PROGRESS`) in the ledger only says the work is under way, which development and QA
 * both are, so it agrees with either; every other pair that differs is a disagreement.
 */
export function ledgerDiverges(
  ledgerStage: TaskStatus | null | undefined,
  status: TaskStatus,
): boolean {
  if (!ledgerStage || ledgerStage === status) {
    return false;
  }
  return !(ledgerStage === 'EN_DESARROLLO' && status === 'QA');
}

/** The badge's words, both stages written out so it does not depend on a colour. */
export function ledgerDivergenceText(ledgerStage: TaskStatus, status: TaskStatus): string {
  return `Registro: ${statusLabel(ledgerStage)} · PM Hub: ${statusLabel(status)}`;
}
