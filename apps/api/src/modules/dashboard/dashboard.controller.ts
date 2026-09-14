import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DashboardService } from './dashboard.service.js';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(@CurrentActorId() actorId: string) {
    return this.dashboardService.getSummary(actorId);
  }

  @Get('activity')
  getActivity(@CurrentActorId() actorId: string) {
    return this.dashboardService.getActivity(actorId);
  }
}
