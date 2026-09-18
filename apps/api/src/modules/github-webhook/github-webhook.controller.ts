import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SynchronizationService } from '../synchronization/synchronization.service.js';

const SIGNATURE_HEADER = 'x-hub-signature-256';
const EVENT_HEADER = 'x-github-event';

interface GitHubPushPayload {
  repository?: { full_name?: string };
}

/**
 * GitHub webhook ingestion (Roadmap GAP-29, brief §27/§29): a `push` to a
 * GitHub-backed project's repository triggers the same
 * `SynchronizationService.runSync` path a scheduled/manual run uses,
 * instead of waiting up to `syncIntervalMinutes` for the next poll.
 *
 * Unauthenticated by the usual `JwtAuthGuard`/`ApiKeyGuard` conventions —
 * GitHub can't send a bearer token — because `X-Hub-Signature-256` (an
 * HMAC-SHA256 over the raw request body, keyed with `GITHUB_WEBHOOK_SECRET`)
 * is itself the authentication boundary. Verified against `req.rawBody`
 * (captured by `rawBody: true` in main.ts) rather than re-serializing the
 * parsed JSON, since object -> JSON round-tripping is not guaranteed to
 * reproduce the exact bytes GitHub signed (key order, whitespace, unicode
 * escaping).
 *
 * DECISION (Roadmap GAP-29, missing definition — ADR-016,
 * docs/Stack_Tecnologies.md): no explicit `GIT_PROVIDER_TYPE=github` guard.
 * A `local`-provider project's `docsPath` is a filesystem path, which can
 * never equal or prefix a GitHub `owner/repo` full name, so an unmatched
 * repository already triggers zero syncs without a separate mode check —
 * one precondition (a configured secret) instead of two.
 *
 * The HTTP response never waits for a matched project's sync to finish —
 * see the comment above the `runSync` call for why.
 */
@Controller('webhooks/github')
export class GithubWebhookController {
  private readonly logger = new Logger(GithubWebhookController.name);

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
    private readonly synchronizationService: SynchronizationService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers(SIGNATURE_HEADER) signatureHeader: string | undefined,
    @Headers(EVENT_HEADER) event: string | undefined,
  ): Promise<{ matchedProjects: number }> {
    const secret = this.configService.get('GITHUB_WEBHOOK_SECRET', {
      infer: true,
    });
    if (!secret) {
      throw new ServiceUnavailableException(
        'GitHub webhook ingestion is not configured (set GITHUB_WEBHOOK_SECRET)',
      );
    }
    if (!request.rawBody) {
      throw new BadRequestException('Missing request body');
    }
    this.verifySignature(request.rawBody, signatureHeader, secret);

    // Only `push` moves docs; `ping` (GitHub's own setup check) and every
    // other event type are acknowledged as a no-op rather than rejected.
    if (event !== 'push') {
      return { matchedProjects: 0 };
    }

    const payload = request.body as GitHubPushPayload;
    const fullName = payload.repository?.full_name;
    if (!fullName) {
      // The likeliest cause is the webhook configured with content type
      // `application/x-www-form-urlencoded` instead of `application/json`
      // (docs/synchronization.md "Trigger") — GitHub then sends the
      // payload as a form field, signature verification still passes
      // (it only needs the raw bytes), but there is no `body.repository`
      // to read. Without this line that misconfiguration is invisible:
      // GitHub shows a green delivery and nothing ever syncs.
      this.logger.warn(
        'Received a signed push event with no repository.full_name in the body — check the webhook is configured with content type application/json',
      );
      return { matchedProjects: 0 };
    }

    const projects = await this.findProjectsForRepo(fullName);
    if (projects.length === 0) {
      this.logger.warn(
        `Received a signed push for "${fullName}" but no project's docsPath names that repository`,
      );
      return { matchedProjects: 0 };
    }

    // Not awaited: under GIT_PROVIDER_TYPE=github, runSync makes several
    // sequential api.github.com round-trips per project and can hold a
    // pg_advisory_xact_lock a concurrent scheduled tick already has — easily
    // past GitHub's ~10s delivery timeout, especially multiplied across
    // several matched projects. GitHub would then show a failed delivery
    // for a sync that succeeded anyway. The response only reports how many
    // projects were matched; each sync's own outcome lives in its SyncRun
    // row exactly like a scheduled/manual run's does.
    for (const project of projects) {
      void this.synchronizationService
        .runSync(project.id, 'WEBHOOK')
        .catch((error: unknown) => {
          // Mirrors SyncSchedulerService.tick(): one project's sync
          // failure (already persisted as its own FAILED SyncRun) must
          // never fail the webhook response or block another matched
          // project's sync in the same delivery.
          this.logger.error(
            `Webhook-triggered sync failed for project ${project.id} (${fullName}): ${String(error)}`,
          );
        });
    }
    return { matchedProjects: projects.length };
  }

  private verifySignature(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    secret: string,
  ): void {
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(signatureHeader ?? '');
    const valid =
      expectedBuffer.length === providedBuffer.length &&
      timingSafeEqual(expectedBuffer, providedBuffer);
    if (!valid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  /**
   * Prefix match on the "owner/repo" identity GAP-23 stores in docsPath —
   * "acme/widgets" must not match a "acme/widgets-2" project. Filtered in
   * JS rather than a Prisma `startsWith` (-> SQL `LIKE 'fullName%'`): a
   * `full_name` or docsPath containing `%`, `_`, or `\` (GitHub allows
   * underscores in org/repo names; Windows docsPath test fixtures contain
   * backslashes) would otherwise be misinterpreted as LIKE wildcard/escape
   * syntax instead of matched literally. `SyncSchedulerService.tick()`
   * already loads every ACTIVE project every minute, so this is no new
   * scale concern.
   */
  private async findProjectsForRepo(
    fullName: string,
  ): Promise<{ id: string }[]> {
    const candidates = await this.prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, docsPath: true },
    });
    return candidates.filter(
      (project) =>
        project.docsPath === fullName ||
        project.docsPath.startsWith(`${fullName}/`),
    );
  }
}
