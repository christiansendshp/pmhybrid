/**
 * A key that names one attempt to create something, minted when its form
 * opens and reused by every retry of that form until it succeeds: the API
 * answers a repeat with the task the first request made instead of a second
 * one (Roadmap BUG-07b). `crypto.randomUUID` exists only in a secure context
 * (https or localhost), and this app is also served over plain http on a
 * local network, so the fallback builds an equally opaque token by hand.
 */
export function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
