import { PrismaClient } from '@prisma/client';
import {
  assertLocalDatabase,
  isTestFixtureActor,
} from '../src/common/fixture-actors.js';

/**
 * Deactivates the test fixtures left in a development database (Roadmap
 * IMPROVEMENT-02d): the people and agents the suite made before it had a database
 * of its own. A dry run by default; `--apply` does it. Never deletes an actor,
 * since history points at them, and never touches one whose name and email carry
 * no timestamp. Reversible: an actor is switched back on from the Team page.
 *
 *   pnpm --filter api db:tidy-dev            # what it would do
 *   pnpm --filter api db:tidy-dev -- --apply # do it
 */
async function main(): Promise<void> {
  assertLocalDatabase(process.env);
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const actors = await prisma.actor.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, email: true, kind: true },
    });
    const fixtures = actors.filter(isTestFixtureActor);
    console.log(
      `${fixtures.length} of ${actors.length} active people and agents are test fixtures.`,
    );
    for (const actor of fixtures.slice(0, 10)) {
      console.log(
        `  ${actor.kind} ${actor.displayName} <${actor.email ?? '—'}>`,
      );
    }
    if (fixtures.length > 10) {
      console.log(`  … and ${fixtures.length - 10} more`);
    }
    if (!apply) {
      console.log(
        'Dry run: nothing changed. Run with --apply to deactivate them.',
      );
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.actor.updateMany({
        where: { id: { in: fixtures.map((actor) => actor.id) } },
        data: { isActive: false },
      });
      await tx.auditEvent.createMany({
        data: fixtures.map((actor) => ({
          entityType: 'Actor',
          entityId: actor.id,
          operation: 'UPDATE',
          origin: 'SYSTEM' as const,
          previousValue: { isActive: true },
          newValue: { isActive: false },
        })),
      });
    });
    console.log(`Deactivated ${fixtures.length}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
