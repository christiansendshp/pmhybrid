import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { WorkloadQueryDto } from './dto/workload-query.dto.js';
import { WorkloadService } from './workload.service.js';

@UseGuards(JwtAuthGuard)
@Controller('workload')
export class WorkloadController {
  constructor(private readonly workloadService: WorkloadService) {}

  @Get()
  get(@CurrentActorId() actorId: string, @Query() query: WorkloadQueryDto) {
    return this.workloadService.getWorkload(actorId, query);
  }
}
