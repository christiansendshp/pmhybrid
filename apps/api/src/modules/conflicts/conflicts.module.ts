import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SynchronizationModule } from '../synchronization/synchronization.module.js';
import { ConflictsController } from './conflicts.controller.js';
import { ConflictsService } from './conflicts.service.js';

@Module({
  imports: [AuthModule, SynchronizationModule],
  controllers: [ConflictsController],
  providers: [ConflictsService],
  exports: [ConflictsService],
})
export class ConflictsModule {}
