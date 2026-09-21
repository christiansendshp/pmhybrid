import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma-health.indicator.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealthIndicator: PrismaHealthIndicator,
  ) {}

  /**
   * Liveness (Roadmap IMPROVEMENT-02c): the process is up and answering. It
   * does not touch the database, so a database that is down does not get a
   * healthy API restarted for it.
   */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: the API can do its work, which needs the database. */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.prismaHealthIndicator.check('db')]);
  }
}
