import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RisksController } from './risks.controller.js';
import { RisksService } from './risks.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RisksController],
  providers: [RisksService],
  exports: [RisksService],
})
export class RisksModule {}
