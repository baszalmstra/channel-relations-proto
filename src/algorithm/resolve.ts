import type {
  ChannelRegistry,
  PriorityEdge,
  ResolutionResult,
} from "./types.js";

/**
 * Discover all channels reachable from user-specified channels
 * by following their declared relations (base and overrides).
 */
function discoverChannels(
  userChannels: string[],
  registry: ChannelRegistry,
  maxDepth: number
): string[] {
  const discovered = new Set<string>();
  const queue: Array<{ channel: string; depth: number }> = [];

  for (const ch of userChannels) {
    discovered.add(ch);
    queue.push({ channel: ch, depth: 0 });
  }

  while (queue.length > 0) {
    const { channel, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    const relations = registry.get(channel);
    if (!relations) continue;

    for (const related of [relations.base, relations.overrides]) {
      if (related && !discovered.has(related)) {
        discovered.add(related);
        queue.push({ channel: related, depth: depth + 1 });
      }
    }
  }

  return Array.from(discovered);
}

/**
 * Check if `from` can reach `to` following only the given edges.
 */
function isReachable(
  from: string,
  to: string,
  adjacency: Map<string, string[]>
): boolean {
  const visited = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      stack.push(neighbor);
    }
  }
  return false;
}

/**
 * Build the priority graph from user channels and channel registry.
 *
 * 1. Add edges between consecutive user-specified channels.
 * 2. Discover all related channels transitively.
 * 3. Add base/override edges, ignoring those that conflict with user edges.
 */
function buildGraph(
  userChannels: string[],
  registry: ChannelRegistry,
  maxDepth: number
): {
  edges: PriorityEdge[];
  ignoredEdges: PriorityEdge[];
  channels: string[];
} {
  const userSet = new Set(userChannels);

  // User-specified priority edges (consecutive pairs)
  const userEdges: PriorityEdge[] = [];
  for (let i = 0; i < userChannels.length - 1; i++) {
    userEdges.push({
      from: userChannels[i],
      to: userChannels[i + 1],
      source: "user",
    });
  }

  // Build adjacency map for user edges (to check reachability)
  const userAdj = new Map<string, string[]>();
  for (const edge of userEdges) {
    if (!userAdj.has(edge.from)) userAdj.set(edge.from, []);
    userAdj.get(edge.from)!.push(edge.to);
  }

  // Discover all channels
  const allChannels = discoverChannels(userChannels, registry, maxDepth);

  // Build relation edges
  const relationEdges: PriorityEdge[] = [];
  const ignoredEdges: PriorityEdge[] = [];

  for (const channel of allChannels) {
    const relations = registry.get(channel);
    if (!relations) continue;

    if (relations.base) {
      // base has higher priority than declaring channel: base -> channel
      const edge: PriorityEdge = {
        from: relations.base,
        to: channel,
        source: "base",
      };

      // Skip if the related channel is already user-specified at a position
      // that would conflict. A conflict means user ordering says the opposite.
      if (
        userSet.has(edge.from) &&
        userSet.has(edge.to) &&
        isReachable(edge.to, edge.from, userAdj)
      ) {
        ignoredEdges.push(edge);
      } else {
        relationEdges.push(edge);
      }
    }

    if (relations.overrides) {
      // declaring channel has higher priority than overridden: channel -> overridden
      const edge: PriorityEdge = {
        from: channel,
        to: relations.overrides,
        source: "override",
      };

      if (
        userSet.has(edge.from) &&
        userSet.has(edge.to) &&
        isReachable(edge.to, edge.from, userAdj)
      ) {
        ignoredEdges.push(edge);
      } else {
        relationEdges.push(edge);
      }
    }
  }

  return {
    edges: [...userEdges, ...relationEdges],
    ignoredEdges,
    channels: allChannels,
  };
}

/**
 * DFS-based topological sort with cycle detection.
 * Returns channels in priority order (highest first).
 */
function topologicalSort(
  channels: string[],
  edges: PriorityEdge[]
): { order: string[] } | { error: { type: "cycle"; path: string[] } } {
  const adjacency = new Map<string, string[]>();
  for (const ch of channels) {
    adjacency.set(ch, []);
  }
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from)!.push(edge.to);
  }

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  for (const ch of channels) {
    color.set(ch, WHITE);
    parent.set(ch, null);
  }

  const result: string[] = [];

  function dfs(
    node: string
  ): { type: "cycle"; path: string[] } | undefined {
    color.set(node, GRAY);

    for (const neighbor of adjacency.get(node) ?? []) {
      if (color.get(neighbor) === GRAY) {
        // Found a cycle - reconstruct path
        const path = [neighbor, node];
        let current = node;
        while (current !== neighbor) {
          current = parent.get(current)!;
          if (current === null) break;
          path.push(current);
        }
        path.reverse();
        return { type: "cycle", path };
      }
      if (color.get(neighbor) === WHITE) {
        parent.set(neighbor, node);
        const err = dfs(neighbor);
        if (err) return err;
      }
    }

    color.set(node, BLACK);
    result.push(node);
    return undefined;
  }

  for (const ch of channels) {
    if (color.get(ch) === WHITE) {
      const err = dfs(ch);
      if (err) return { error: err };
    }
  }

  // DFS post-order gives reverse topological order
  result.reverse();
  return { order: result };
}

/**
 * Resolve channel priority order from user-specified channels and a channel registry.
 *
 * This implements the algorithm from the CEP:
 * 1. Discover all related channels transitively
 * 2. Build a priority graph with user and relation edges
 * 3. Detect and ignore conflicting relation edges
 * 4. Topological sort for final order
 */
export function resolveChannelPriority(
  userChannels: string[],
  registry: ChannelRegistry,
  maxDepth: number = 10
): ResolutionResult {
  if (userChannels.length === 0) {
    return {
      order: [],
      edges: [],
      ignoredEdges: [],
      channels: [],
    };
  }

  const { edges, ignoredEdges, channels } = buildGraph(
    userChannels,
    registry,
    maxDepth
  );

  const sortResult = topologicalSort(channels, edges);

  if ("error" in sortResult) {
    return {
      order: [],
      edges,
      ignoredEdges,
      channels,
      error: sortResult.error,
    };
  }

  return {
    order: sortResult.order,
    edges,
    ignoredEdges,
    channels,
  };
}
