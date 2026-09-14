import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PhasesController } from './phases.controller.js';
import { PhasesService } from './phases.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PhasesController],
  providers: [PhasesService],
  exports: [PhasesService],
})
export class PhasesModule {}
