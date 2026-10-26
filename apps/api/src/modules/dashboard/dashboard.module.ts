import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { PeriodSummaryService } from './period-summary.service.js';
import { SinceVisitController } from './since-visit.controller.js';
import { SinceVisitService } from './since-visit.service.js';

@Module({
  imports: [AuthModule, TasksModule, NotificationsModule],
  controllers: [DashboardController, SinceVisitController],
  providers: [DashboardService, SinceVisitService, PeriodSummaryService],
})
export class DashboardModule {}
