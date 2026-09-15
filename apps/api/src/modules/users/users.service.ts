import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffFields } from '../audit/audit.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

const USER_SELECT = {
  id: true,
  kind: true,
  displayName: true,
  email: true,
  avatarUrl: true,
  isActive: true,
  createdAt: true,
} as const;

/**
 * Thin layer over Actor(kind=HUMAN)/UserCredential (docs/domain-model.md).
 * Actor changes are audited as project-less `Actor` events.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.actor.findMany({
      where: { kind: 'HUMAN' },
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.actor.findFirst({
      where: { id, kind: 'HUMAN' },
      select: USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async create(dto: CreateUserDto, requesterActorId: string) {
    if (await this.prisma.actor.findUnique({ where: { email: dto.email } })) {
      throw new ConflictException('Email already in use');
    }
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.actor.create({
        data: {
          kind: 'HUMAN',
          displayName: dto.displayName,
          email: dto.email,
          avatarUrl: dto.avatarUrl,
          credential: { create: { authProvider: 'LOCAL', passwordHash } },
        },
        select: USER_SELECT,
      });
      await this.audit.record(
        {
          projectId: null,
          actorId: requesterActorId,
          entityType: 'Actor',
          entityId: user.id,
          operation: 'CREATE',
          origin: 'UI',
          newValue: diffFields(
            {},
            {
              kind: user.kind,
              displayName: user.displayName,
              email: user.email,
              avatarUrl: user.avatarUrl,
            },
          )?.newValue,
        },
        tx,
      );
      return user;
    });
  }

  /** Deactivation (brief §3 "estado activo/inactivo") blocks login and every already-issued access token. */
  async update(id: string, dto: UpdateUserDto, requesterActorId: string) {
    const user = await this.findById(id);
    if (dto.isActive === false && id === requesterActorId) {
      throw new BadRequestException('You cannot deactivate yourself');
    }
    const diff = diffFields(user as unknown as Record<string, unknown>, {
      ...dto,
    });
    if (!diff) {
      return user;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.actor.update({
        where: { id },
        data: dto,
        select: USER_SELECT,
      });
      await this.audit.record(
        {
          projectId: null,
          actorId: requesterActorId,
          entityType: 'Actor',
          entityId: id,
          operation: 'UPDATE',
          origin: 'UI',
          ...diff,
        },
        tx,
      );
      return updated;
    });
  }
}
