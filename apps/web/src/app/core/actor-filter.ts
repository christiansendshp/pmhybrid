import type { Actor } from './actors.service.js';

/** Lower-case, accents removed, so "garcia" finds "García" and "ANA" finds "Ana". */
function normalize(text: string): string {
  // \p{M}: the combining marks NFD splits an accent into.
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/**
 * The people or agents of the Team page that match what was typed (Roadmap
 * UX-03c3): by name, email or an agent's provider, in any order of words. An
 * empty query keeps everyone.
 */
export function filterActors(actors: readonly Actor[], query: string): Actor[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return actors.slice();
  }
  return actors.filter((actor) => {
    const haystack = normalize(
      [actor.displayName, actor.email ?? '', actor.agentProfile?.providerType ?? ''].join(' '),
    );
    return terms.every((term) => haystack.includes(term));
  });
}
