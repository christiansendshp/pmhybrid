/**
 * A project's task dependencies as an in-memory graph (Roadmap
 * IMPROVEMENT-01a): task id -> the ids it depends on. Loaded once, then
 * checked and kept current in memory, instead of one query per hop of a
 * search — a chain of 150 dependencies took 15 s and 500 outlasted the sync
 * transaction.
 */
export type DependencyGraph = Map<string, Set<string>>;

export function buildDependencyGraph(
  edges: readonly { taskId: string; dependsOnTaskId: string | null }[],
): DependencyGraph {
  const graph: DependencyGraph = new Map();
  for (const edge of edges) {
    if (edge.dependsOnTaskId) {
      addDependencyEdge(graph, edge.taskId, edge.dependsOnTaskId);
    }
  }
  return graph;
}

export function addDependencyEdge(
  graph: DependencyGraph,
  taskId: string,
  dependsOnTaskId: string,
): void {
  const targets = graph.get(taskId);
  if (targets) {
    targets.add(dependsOnTaskId);
  } else {
    graph.set(taskId, new Set([dependsOnTaskId]));
  }
}

export function removeDependencyEdge(
  graph: DependencyGraph,
  taskId: string,
  dependsOnTaskId: string,
): void {
  graph.get(taskId)?.delete(dependsOnTaskId);
}

/**
 * Whether adding `taskId -> dependsOnTaskId` closes a cycle: exactly when
 * `dependsOnTaskId` can already reach `taskId`. A task depending on itself is
 * the shortest cycle. Iterative, so a long chain cannot overflow the stack.
 */
export function wouldCloseCycle(
  graph: DependencyGraph,
  taskId: string,
  dependsOnTaskId: string,
): boolean {
  const visited = new Set<string>();
  const stack = [dependsOnTaskId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const next of graph.get(current) ?? []) {
      stack.push(next);
    }
  }
  return false;
}
