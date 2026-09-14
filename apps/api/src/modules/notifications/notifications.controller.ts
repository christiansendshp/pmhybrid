import { Controller, Get, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(@Query('actorId') actorId: string) {
    return this.notificationsService.findAllForActor(actorId);
  }
}
