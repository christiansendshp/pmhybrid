import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';

/**
 * Thin layer over Actor(kind=HUMAN)/UserCredential (docs/architecture.md,
 * docs/domain-model.md). Only list/get/create for FASE-04 — update/delete
 * and any permission-key enforcement are later phases.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.actor.findMany({
      where: { kind: 'HUMAN' },
      select: {
        id: true,
        displayName: true,
        email: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  findById(id: string) {
    return this.prisma.actor.findFirstOrThrow({
      where: { id, kind: 'HUMAN' },
      select: {
        id: true,
        displayName: true,
        email: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async create(dto: CreateUserDto) {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    const actor = await this.prisma.actor.create({
      data: {
        kind: 'HUMAN',
        displayName: dto.displayName,
        email: dto.email,
        credential: { create: { authProvider: 'LOCAL', passwordHash } },
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        isActive: true,
        createdAt: true,
      },
    });
    return actor;
  }
}
