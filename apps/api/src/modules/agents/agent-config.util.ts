/**
 * Key names that read as a credential once lower-cased and stripped of
 * separators (`apiKey`, `auth_token`, `clientSecret`, ...), while ordinary
 * model settings such as `maxTokens` or `tokenizer` stay allowed.
 */
const SECRET_KEY_PATTERN =
  /secret|password|passwd|credential|(token|apikey|accesskey|privatekey)$/;

/**
 * Paths of every key in an agent's config that looks like a credential.
 * AgentProfile.configJson is plain JSON in the database, so it must never
 * carry secrets — those belong in environment variables (brief §28).
 */
export function findSecretLikeKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findSecretLikeKeys(item, `${path}[${index}]`),
    );
  }
  if (value === null || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value).flatMap(([key, nested]) => {
    const keyPath = path ? `${path}.${key}` : key;
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return [
      ...(SECRET_KEY_PATTERN.test(normalized) ? [keyPath] : []),
      ...findSecretLikeKeys(nested, keyPath),
    ];
  });
}
