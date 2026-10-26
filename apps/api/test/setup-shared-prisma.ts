import { TestingModuleBuilder } from '@nestjs/testing';
import { afterAll } from 'vitest';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { E2E_CONNECTIONS_PER_FILE } from './e2e-limits.js';

/**
 * Every e2e spec boots the whole application in each of its tests, and each boot used to start its
 * own Prisma query engine: about two seconds of a test that otherwise takes a few hundred
 * milliseconds, measured at 20 ms once the connection is shared (Roadmap TASK-27). Here the
 * applications a file boots share one PrismaService, connected by its first query and ended when
 * the file is done, so closing an application no longer closes the database under the next one.
 *
 * Nothing else changes: each test still gets its own application, module graph and providers,
 * and the database is the same shared one it always was.
 */
let shared: PrismaService | undefined;

function sharedPrisma(): PrismaService {
  if (!shared) {
    // Its own pool is capped: left at Prisma's default (twice the cores, plus one) a score of files
    // would hold more connections than the database accepts (`too many clients already`).
    const url = new URL(process.env.DATABASE_URL ?? '');
    url.searchParams.set('connection_limit', String(E2E_CONNECTIONS_PER_FILE));
    const prisma = new PrismaService({ datasourceUrl: url.toString() });
    // The first query connects, and an application that closes must not end the connection the next one uses.
    prisma.onModuleInit = async () => undefined;
    prisma.onModuleDestroy = async () => undefined;
    shared = prisma;
  }
  return shared;
}

const compile = TestingModuleBuilder.prototype.compile;
TestingModuleBuilder.prototype.compile = function (
  this: TestingModuleBuilder,
  options?: Parameters<TestingModuleBuilder['compile']>[0],
) {
  this.overrideProvider(PrismaService).useValue(sharedPrisma());
  return compile.call(this, options);
};

afterAll(async () => {
  await shared?.$disconnect();
  shared = undefined;
});
