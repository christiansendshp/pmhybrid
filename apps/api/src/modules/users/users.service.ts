import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** FASE-03 shell — thin layer over Actor(kind=HUMAN)/UserCredential. Real CRUD lands in FASE-04. */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.actor.findMany({ where: { kind: 'HUMAN' } });
  }
}
