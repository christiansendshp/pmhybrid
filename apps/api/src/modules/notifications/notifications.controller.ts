import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { NotificationsService } from './notifications.service.js';

/** Every actor reads and marks only their own notifications — actorId always comes from the JWT, never a param. */
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(@CurrentActorId() actorId: string) {
    return this.notificationsService.findAllForActor(actorId);
  }

  /** "Marcar todas como leídas": only the caller's own unread ones (Roadmap UX-01). Declared before `:id/read`, which it must never be read as. */
  @Patch('read-all')
  markAllRead(@CurrentActorId() actorId: string) {
    return this.notificationsService.markAllRead(actorId);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentActorId() actorId: string) {
    return this.notificationsService.markRead(id, actorId);
  }
}
