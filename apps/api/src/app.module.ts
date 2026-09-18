import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module.js';
import { CommonModule } from './common/common.module.js';
import { validateEnv } from './config/env.validation.js';

import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AgentsModule } from './modules/agents/agents.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { ProjectMembersModule } from './modules/project-members/project-members.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { PhasesModule } from './modules/phases/phases.module.js';
import { EpicsModule } from './modules/epics/epics.module.js';
import { TemplatesModule } from './modules/templates/templates.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { RoadmapModule } from './modules/roadmap/roadmap.module.js';
import { SynchronizationModule } from './modules/synchronization/synchronization.module.js';
import { GitProvidersModule } from './modules/git-providers/git-providers.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { ConflictsModule } from './modules/conflicts/conflicts.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { WorkloadModule } from './modules/workload/workload.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,

    AuthModule,
    UsersModule,
    AgentsModule,
    ProjectsModule,
    ProjectMembersModule,
    RolesModule,
    PhasesModule,
    EpicsModule,
    TemplatesModule,
    TasksModule,
    RoadmapModule,
    SynchronizationModule,
    GitProvidersModule,
    AuditModule,
    RealtimeModule,
    NotificationsModule,
    ConflictsModule,
    DashboardModule,
    WorkloadModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
