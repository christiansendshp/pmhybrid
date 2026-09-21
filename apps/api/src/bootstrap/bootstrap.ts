import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { seedAccessCatalog } from './access-catalog.js';

/**
 * First start of a real installation (Roadmap IMPROVEMENT-02c). The demo seed
 * refuses a production environment on purpose (it plants an administrator with
 * a documented password), which left a fresh production database with no
 * permissions, no roles and nobody able to sign in. This writes the access model
 * and, once, the first administrator from the environment, and no demo data.
 * Run on every start: with an administrator already there it changes nothing
 * but the catalog's additions.
 */

const MIN_PASSWORD_LENGTH = 12;
/** The password the demo seed documents, and the obvious ones: refused for the administrator of a real installation. */
const KNOWN_PASSWORDS = new Set([
  'demo1234',
  'password1234',
  '123456789012',
  'changeme1234',
  'change-me-please',
]);

export type AdminPlan =
  | { action: 'none' }
  | {
      action: 'create';
      email: string;
      displayName: string;
      password: string;
    };

/**
 * What to do about the first administrator, from the environment and from how
 * many administrators there already are. With one, nothing: this never resets a
 * password or adds a second. Without one, the environment must say who they are,
 * and the password must be one worth guarding an installation with.
 */
export function planFirstAdmin(
  env: Record<string, string | undefined>,
  existingAdmins: number,
): AdminPlan {
  if (existingAdmins > 0) {
    return { action: 'none' };
  }
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'There is no administrator yet: set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (and optionally BOOTSTRAP_ADMIN_NAME) so the first start can create one',
    );
  }
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL is not an email address');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  if (KNOWN_PASSWORDS.has(password.toLowerCase()) || password === email) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD is a password everyone guesses');
  }
  return {
    action: 'create',
    email,
    displayName: env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Administrator',
    password,
  };
}

export interface BootstrapResult {
  /** Email of the administrator created by this run, if it created one. */
  createdAdmin: string | null;
}

/** Writes the access catalog and, when there is no administrator, the first one. */
export async function bootstrapInstallation(
  prisma: PrismaClient,
  env: Record<string, string | undefined>,
): Promise<BootstrapResult> {
  const { globalRolesByName } = await seedAccessCatalog(prisma);
  const adminRole = globalRolesByName.get('ADMIN')!;
  const existingAdmins = await prisma.actorRole.count({
    where: { roleId: adminRole.id, projectId: null },
  });
  const plan = planFirstAdmin(env, existingAdmins);
  if (plan.action === 'none') {
    return { createdAdmin: null };
  }

  const passwordHash = await argon2.hash(plan.password, {
    type: argon2.argon2id,
  });
  await prisma.$transaction(async (tx) => {
    // An actor with that email that exists but does not administer anything
    // (a person who signed up first) is promoted; it is not duplicated.
    const actor = await tx.actor.upsert({
      where: { email: plan.email },
      update: { isActive: true },
      create: {
        kind: 'HUMAN',
        displayName: plan.displayName,
        email: plan.email,
      },
    });
    await tx.userCredential.upsert({
      where: { actorId: actor.id },
      update: { passwordHash },
      create: { actorId: actor.id, authProvider: 'LOCAL', passwordHash },
    });
    await tx.actorRole.create({
      data: { actorId: actor.id, roleId: adminRole.id },
    });
  });
  return { createdAdmin: plan.email };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const { createdAdmin } = await bootstrapInstallation(prisma, process.env);
    console.log(
      createdAdmin
        ? `Bootstrap: access catalog written; administrator ${createdAdmin} created.`
        : 'Bootstrap: access catalog written; an administrator already exists.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Run as a script (`node dist/bootstrap/bootstrap.js`), not when imported by a test.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(
      `Bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
