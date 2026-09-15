import { describe, expect, it } from 'vitest';
import { findSecretLikeKeys } from './agent-config.util.js';

describe('findSecretLikeKeys', () => {
  it('flags credential-looking keys at any depth, with their path', () => {
    expect(
      findSecretLikeKeys({
        apiKey: 'x',
        provider: { auth_token: 'y' },
        fallbacks: [{ clientSecret: 'z' }],
        PASSWORD: 'w',
      }),
    ).toEqual([
      'apiKey',
      'provider.auth_token',
      'fallbacks[0].clientSecret',
      'PASSWORD',
    ]);
  });

  it('allows ordinary model settings that merely mention tokens', () => {
    expect(
      findSecretLikeKeys({
        model: 'claude-opus-5',
        maxTokens: 4096,
        tokenizer: 'default',
        temperature: 0.2,
      }),
    ).toEqual([]);
  });

  it('treats a missing or scalar config as clean', () => {
    expect(findSecretLikeKeys(undefined)).toEqual([]);
    expect(findSecretLikeKeys('token')).toEqual([]);
  });
});
