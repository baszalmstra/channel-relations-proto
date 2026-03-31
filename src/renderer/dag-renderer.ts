import * as d3 from "d3";
import dagre from "@dagrejs/dagre";
import type { ResolutionResult } from "../algorithm/types.js";

const COLORS = {
  user: "#3b82f6",
  base: "#22c55e",
  override: "#f59e0b",
  ignored: "#9ca3af",
  nodeUser: "#dbeafe",
  nodeUserStroke: "#3b82f6",
  nodeDiscovered: "#f3f4f6",
  nodeDiscoveredStroke: "#6b7280",
  nodeError: "#fecaca",
  nodeErrorStroke: "#ef4444",
};

const NODE_WIDTH = 140;
const NODE_HEIGHT = 40;
const MARGIN = { top: 20, right: 20, bottom: 20, left: 20 };

export function renderGraph(
  svgElement: SVGSVGElement,
  result: ResolutionResult,
  userChannels: string[]
): void {
  const svg = d3.select(svgElement);
  svg.selectAll("*").remove();

  if (result.channels.length === 0) {
    return;
  }

  const userSet = new Set(userChannels);
  const cycleSet = new Set(result.error?.path ?? []);

  // Build dagre graph
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 30, ranksep: 50, marginx: MARGIN.left, marginy: MARGIN.top });
  g.setDefaultEdgeLabel(() => ({}));

  for (const ch of result.channels) {
    g.setNode(ch, { label: ch, width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  const allEdges = [...result.edges, ...result.ignoredEdges.map((e) => ({ ...e, _ignored: true as const }))];

  for (const edge of allEdges) {
    const ignored = "_ignored" in edge;
    g.setEdge(edge.from, edge.to, {
      source: edge.source,
      ignored,
    });
  }

  dagre.layout(g);

  const graphInfo = g.graph();
  const width = (graphInfo.width ?? 400) + MARGIN.left + MARGIN.right;
  const height = (graphInfo.height ?? 200) + MARGIN.top + MARGIN.bottom;

  svg.attr("viewBox", `0 0 ${width} ${height}`);
  svg.attr("width", "100%");
  svg.attr("height", height);

  // Arrow marker definitions
  const defs = svg.append("defs");
  for (const [id, color] of Object.entries(COLORS).filter(([k]) =>
    ["user", "base", "override", "ignored"].includes(k)
  )) {
    defs
      .append("marker")
      .attr("id", `arrow-${id}`)
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 10)
      .attr("refY", 5)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto-start-reverse")
      .append("path")
      .attr("d", "M 0 0 L 10 5 L 0 10 z")
      .attr("fill", color);
  }

  const container = svg.append("g");

  // Render edges
  g.edges().forEach((e) => {
    const edgeData = g.edge(e) as {
      points: Array<{ x: number; y: number }>;
      source: string;
      ignored: boolean;
    };

    const lineGen = d3
      .line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(d3.curveBasis);

    const color = edgeData.ignored
      ? COLORS.ignored
      : COLORS[edgeData.source as keyof typeof COLORS] ?? COLORS.user;

    container
      .append("path")
      .attr("d", lineGen(edgeData.points))
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", edgeData.ignored ? "6,4" : "none")
      .attr("marker-end", `url(#arrow-${edgeData.ignored ? "ignored" : edgeData.source})`);
  });

  // Render nodes
  g.nodes().forEach((nodeId) => {
    const node = g.node(nodeId) as {
      x: number;
      y: number;
      width: number;
      height: number;
      label: string;
    };

    const isUser = userSet.has(nodeId);
    const isCycle = cycleSet.has(nodeId);

    const fill = isCycle
      ? COLORS.nodeError
      : isUser
        ? COLORS.nodeUser
        : COLORS.nodeDiscovered;
    const stroke = isCycle
      ? COLORS.nodeErrorStroke
      : isUser
        ? COLORS.nodeUserStroke
        : COLORS.nodeDiscoveredStroke;

    const group = container.append("g");

    group
      .append("rect")
      .attr("x", node.x - node.width / 2)
      .attr("y", node.y - node.height / 2)
      .attr("width", node.width)
      .attr("height", node.height)
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", fill)
      .attr("stroke", stroke)
      .attr("stroke-width", 2);

    group
      .append("text")
      .attr("x", node.x)
      .attr("y", node.y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", "13px")
      .attr("font-family", "system-ui, sans-serif")
      .attr("fill", "#1f2937")
      .text(node.label);
  });
}
