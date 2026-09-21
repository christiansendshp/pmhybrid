import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  API_KEY_PREFIX,
  hashApiKeySecret,
} from '../../modules/auth/api-key-crypto.util.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** How long a key that was found valid keeps its own budget without asking the database again. */
const KNOWN_KEY_TTL_MS = 30_000;
/** Bounds the cache against a caller sending endless distinct keys (only valid keys are cached, so this is a ceiling, not a working set). */
const MAX_KNOWN_KEYS = 1000;

/**
 * The request budget is per client, and a client is normally its IP. Several
 * agents behind one host then share one budget and starve each other (they hit
 * 429 after about a hundred writes between them). A request carrying an API
 * key that belongs to a real key is counted against that key instead, so each
 * agent has its own (Roadmap SECURITY-04b2).
 *
 * Only a key that exists changes the bucket. A wrong or made-up key is counted
 * against the IP like any other request, so sending random `X-API-Key` values
 * cannot buy a fresh budget on the login endpoint or anywhere else.
 */
@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  @Inject(PrismaService)
  private readonly prisma!: PrismaService;

  private readonly known = new Map<string, { keyId: string; until: number }>();

  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const headers = req.headers as Record<
      string,
      string | string[] | undefined
    >;
    const header = headers?.['x-api-key'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (typeof raw === 'string' && raw.startsWith(API_KEY_PREFIX)) {
      const keyId = await this.keyIdFor(raw.slice(API_KEY_PREFIX.length));
      if (keyId) {
        return `api-key:${keyId}`;
      }
    }
    return super.getTracker(req);
  }

  private async keyIdFor(secret: string): Promise<string | null> {
    const secretHash = hashApiKeySecret(secret);
    const now = Date.now();
    const cached = this.known.get(secretHash);
    if (cached && cached.until > now) {
      return cached.keyId;
    }
    const found = await this.prisma.apiKey.findUnique({
      where: { secretHash },
      select: { id: true, revokedAt: true, expiresAt: true },
    });
    if (
      !found ||
      found.revokedAt !== null ||
      (found.expiresAt !== null && found.expiresAt.getTime() <= now)
    ) {
      this.known.delete(secretHash);
      return null;
    }
    if (this.known.size >= MAX_KNOWN_KEYS) {
      this.known.clear();
    }
    this.known.set(secretHash, {
      keyId: found.id,
      until: now + KNOWN_KEY_TTL_MS,
    });
    return found.id;
  }
}
