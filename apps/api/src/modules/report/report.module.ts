import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaceModule } from '../metrics/pace.module.js';
import { RisksModule } from '../risks/risks.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { WaitingModule } from '../waiting/waiting.module.js';
import { ReportController } from './report.controller.js';
import { ReportService } from './report.service.js';

@Module({
  imports: [AuthModule, TasksModule, PaceModule, RisksModule, WaitingModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
