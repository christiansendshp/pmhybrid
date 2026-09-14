import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class PrismaHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async check(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }
}
