import { Injectable } from '@nestjs/common';

/**
 * FASE-03 shell. The full trigger/lock/reconciliation/write-back algorithm
 * in docs/synchronization.md (scheduled + manual "Sincronizar ahora", brief
 * §11) lands in FASE-08.
 */
@Injectable()
export class SynchronizationService {
  async runSync(
    _projectId: string,
    _trigger: 'SCHEDULED' | 'MANUAL',
  ): Promise<void> {
    // FASE-08.
  }
}
