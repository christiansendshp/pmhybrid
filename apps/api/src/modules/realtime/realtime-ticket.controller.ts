import { Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  RealtimeTicketService,
  TICKET_TTL_MS,
} from './realtime-ticket.service.js';

/** Mints the handshake ticket the notifications WebSocket gateway redeems (Roadmap GAP-26). */
@UseGuards(JwtAuthGuard)
@Controller('realtime')
export class RealtimeTicketController {
  constructor(private readonly ticketService: RealtimeTicketService) {}

  @Post('ticket')
  mint(@CurrentActorId() actorId: string) {
    return {
      ticket: this.ticketService.mint(actorId),
      expiresInMs: TICKET_TTL_MS,
    };
  }
}
