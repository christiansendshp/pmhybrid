import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [AuthModule, TasksModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
