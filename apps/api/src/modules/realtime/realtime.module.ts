import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { RealtimeTicketController } from './realtime-ticket.controller.js';
import { RealtimeTicketService } from './realtime-ticket.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RealtimeTicketController],
  providers: [RealtimeTicketService, NotificationsGateway],
  exports: [NotificationsGateway],
})
export class RealtimeModule {}
