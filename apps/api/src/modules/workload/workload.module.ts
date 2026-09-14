import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { WorkloadController } from './workload.controller.js';
import { WorkloadService } from './workload.service.js';

@Module({
  imports: [AuthModule, TasksModule],
  controllers: [WorkloadController],
  providers: [WorkloadService],
})
export class WorkloadModule {}
