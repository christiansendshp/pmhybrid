import { Component, OnInit, inject, signal } from '@angular/core';
import { LabelPipe } from '../../shared/label.pipe.js';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { actorKindLabel } from '../../core/actor-kind.js';
import { describeAuditChanges } from '../../core/audit-format.js';
import { AUDIT_ORIGINS, AuditEvent, AuditOrigin, AuditService } from '../../core/audit.service.js';

const PAGE_SIZE = 50;

/** The entity types the API audits today (apps/api/src/modules/audit). */
const AUDIT_ENTITY_TYPES = [
  'Project',
  'Task',
  'ProjectMember',
  'ActorRole',
  'Phase',
  'Epic',
  'Template',
  'SyncRun',
] as const;

/** A project's change history (brief §25, §31 "historial de cambios"), newest first. */
@Component({
  selector: 'app-audit-log',
  imports: [LabelPipe, DatePipe, FormsModule, RouterLink, MatButtonModule, MatSelectModule],
  templateUrl: './audit-log.html',
  styleUrl: './audit-log.scss',
})
export class AuditLog implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auditService = inject(AuditService);

  readonly origins = AUDIT_ORIGINS;
  readonly entityTypes = AUDIT_ENTITY_TYPES;
  readonly events = signal<AuditEvent[]>([]);
  readonly loading = signal(false);
  readonly hasMore = signal(false);
  readonly originFilter = signal<AuditOrigin | null>(null);
  readonly entityTypeFilter = signal<string | null>(null);
  readonly describeChanges = describeAuditChanges;
  readonly actorKindLabel = actorKindLabel;

  private get projectId(): string {
    return this.route.parent!.snapshot.paramMap.get('projectId')!;
  }

  async ngOnInit(): Promise<void> {
    await this.loadPage();
  }

  async onFilterChange(): Promise<void> {
    this.events.set([]);
    await this.loadPage();
  }

  async loadOlder(): Promise<void> {
    await this.loadPage(this.events().at(-1)?.id);
  }

  private async loadPage(cursor?: string): Promise<void> {
    this.loading.set(true);
    try {
      const page = await this.auditService.listForProject(this.projectId, {
        origin: this.originFilter() ?? undefined,
        entityType: this.entityTypeFilter() ?? undefined,
        cursor,
        limit: PAGE_SIZE,
      });
      this.events.set([...this.events(), ...page]);
      this.hasMore.set(page.length === PAGE_SIZE);
    } finally {
      this.loading.set(false);
    }
  }
}
