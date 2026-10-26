import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentActorId } from '../../common/decorators/current-actor-id.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MarkSeenDto } from './dto/mark-seen.dto.js';
import { SinceVisitService } from './since-visit.service.js';

/** What changed in each of the caller's projects since they last marked it as seen (Roadmap TASK-38). Always the caller's own. */
@UseGuards(JwtAuthGuard)
@Controller('dashboard/since-last-visit')
export class SinceVisitController {
  constructor(private readonly sinceVisit: SinceVisitService) {}

  @Get()
  get(@CurrentActorId() actorId: string) {
    return this.sinceVisit.forActor(actorId);
  }

  @Post('seen')
  @HttpCode(200)
  markSeen(@CurrentActorId() actorId: string, @Body() body: MarkSeenDto) {
    return this.sinceVisit.markSeen(actorId, body.projectIds);
  }
}
