import { JsonPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import {
  Conflict,
  ConflictResolutionKind,
  SynchronizationService,
} from '../../core/synchronization.service.js';

@Component({
  selector: 'app-conflicts',
  imports: [JsonPipe, MatButtonModule],
  templateUrl: './conflicts.html',
})
export class Conflicts implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly syncService = inject(SynchronizationService);

  readonly conflicts = signal<Conflict[]>([]);
  readonly loading = signal(true);

  private get projectId(): string {
    return this.route.parent!.snapshot.paramMap.get('projectId')!;
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.conflicts.set(await this.syncService.listConflicts(this.projectId, false));
    } finally {
      this.loading.set(false);
    }
  }

  async resolve(conflict: Conflict, strategy: ConflictResolutionKind): Promise<void> {
    await this.syncService.resolveConflict(this.projectId, conflict.id, strategy);
    await this.reload();
  }
}
