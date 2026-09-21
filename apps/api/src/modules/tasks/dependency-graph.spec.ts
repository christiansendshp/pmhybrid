import { describe, expect, it } from 'vitest';
import {
  addDependencyEdge,
  buildDependencyGraph,
  removeDependencyEdge,
  wouldCloseCycle,
} from './dependency-graph.js';

describe('dependency graph (Roadmap IMPROVEMENT-01a)', () => {
  const chain = (length: number) =>
    buildDependencyGraph(
      Array.from({ length: length - 1 }, (_, index) => ({
        taskId: `t${index + 1}`,
        dependsOnTaskId: `t${index}`,
      })),
    );

  it('sees a cycle exactly when the target can already reach the task', () => {
    // t2 -> t1 -> t0: t0 depending on t2 would close it; t2 depending on t0 already holds through t1.
    const graph = chain(3);

    expect(wouldCloseCycle(graph, 't0', 't2')).toBe(true);
    expect(wouldCloseCycle(graph, 't0', 't1')).toBe(true);
    expect(wouldCloseCycle(graph, 't2', 't0')).toBe(false);
    expect(wouldCloseCycle(graph, 't2', 'unrelated')).toBe(false);
  });

  it('treats a task depending on itself as a cycle', () => {
    expect(wouldCloseCycle(new Map(), 'a', 'a')).toBe(true);
  });

  it('follows diamonds without revisiting, and ignores dangling references', () => {
    const graph = buildDependencyGraph([
      { taskId: 'd', dependsOnTaskId: 'b' },
      { taskId: 'd', dependsOnTaskId: 'c' },
      { taskId: 'b', dependsOnTaskId: 'a' },
      { taskId: 'c', dependsOnTaskId: 'a' },
      { taskId: 'x', dependsOnTaskId: null },
    ]);

    expect(wouldCloseCycle(graph, 'a', 'd')).toBe(true);
    expect(wouldCloseCycle(graph, 'x', 'd')).toBe(false);
    expect(graph.has('x')).toBe(false);
  });

  it('stays current as edges are added and removed', () => {
    const graph = chain(3);
    expect(wouldCloseCycle(graph, 't0', 't2')).toBe(true);

    removeDependencyEdge(graph, 't1', 't0');
    expect(wouldCloseCycle(graph, 't0', 't2')).toBe(false);

    addDependencyEdge(graph, 't1', 't0');
    expect(wouldCloseCycle(graph, 't0', 't2')).toBe(true);
  });

  it('checks a 5000-long chain without recursion or a query per hop', () => {
    const graph = chain(5000);
    const started = Date.now();

    expect(wouldCloseCycle(graph, 't0', 't4999')).toBe(true);
    expect(wouldCloseCycle(graph, 't4999', 't0')).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
