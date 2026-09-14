/**
 * MVP: single hardcoded API origin. Angular's CLI (v21) no longer scaffolds
 * environment.ts by default; a real multi-environment config is deferred
 * until it's actually needed (no premature abstraction).
 */
export const API_BASE_URL = 'http://localhost:3000';
