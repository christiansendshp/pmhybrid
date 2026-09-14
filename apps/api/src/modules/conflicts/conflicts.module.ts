import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConflictsController } from './conflicts.controller.js';
import { ConflictsService } from './conflicts.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ConflictsController],
  providers: [ConflictsService],
  exports: [ConflictsService],
})
export class ConflictsModule {}
