export type TokenType = 'access' | 'refresh';

/** How the caller of this request authenticated (Roadmap GAP-15). Defaults to 'JWT' when unset — request.user always carries it from FASE-15 onward, but older code paths and tests may still construct a bare payload. */
export type AuthMethod = 'JWT' | 'API_KEY';

/**
 * Both access and refresh tokens are signed with the same secret
 * (JWT_SECRET) but carry a `type` claim so one can never be used in place
 * of the other (docs/Stack_Tecnologies.md ADR-005 — no separate
 * RefreshToken table in domain-model.md, so refresh is stateless/unrevokable
 * for MVP; rotation-with-persistence is a documented future extension).
 */
export interface JwtPayload {
  sub: string; // Actor id
  type: TokenType;
  authMethod?: AuthMethod;
}
