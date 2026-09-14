import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EpicsController } from './epics.controller.js';
import { EpicsService } from './epics.service.js';

@Module({
  imports: [AuthModule],
  controllers: [EpicsController],
  providers: [EpicsService],
  exports: [EpicsService],
})
export class EpicsModule {}
