/** Humans and AI agents are shown the same way, with their kind always visible (brief §3). */
export function actorKindLabel(kind: string): string {
  return kind === 'AI_AGENT' ? 'Agente IA' : 'Humano';
}
