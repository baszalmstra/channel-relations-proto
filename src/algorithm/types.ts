/** A channel's declared relations in its repodata.json */
export interface ChannelRelations {
  /** Channel with HIGHER priority than this channel */
  base?: string;
  /** Channel with LOWER priority than this channel */
  overrides?: string;
}

/** Maps channel name to its declared relations */
export type ChannelRegistry = Map<string, ChannelRelations>;

/** A directed edge in the priority graph: `from` has higher priority than `to` */
export interface PriorityEdge {
  from: string;
  to: string;
  source: "user" | "base" | "override";
}

export interface ResolutionResult {
  /** Final channel priority order (highest priority first) */
  order: string[];
  /** All edges in the resolved graph */
  edges: PriorityEdge[];
  /** Edges that were ignored due to conflict with user ordering */
  ignoredEdges: PriorityEdge[];
  /** All discovered channels */
  channels: string[];
  /** Error if resolution failed */
  error?: { type: "cycle"; path: string[] };
}
