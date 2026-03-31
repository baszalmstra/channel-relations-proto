import { describe, it, expect } from "vitest";
import { resolveChannelPriority } from "../algorithm/resolve.js";
import type { ChannelRegistry } from "../algorithm/types.js";

function registry(
  entries: Record<string, { base?: string; overrides?: string }>
): ChannelRegistry {
  return new Map(Object.entries(entries));
}

describe("resolveChannelPriority", () => {
  it("returns empty for no user channels", () => {
    const result = resolveChannelPriority([], new Map());
    expect(result.order).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it("returns single channel with no relations", () => {
    const reg = registry({ "conda-forge": {} });
    const result = resolveChannelPriority(["conda-forge"], reg);
    expect(result.order).toEqual(["conda-forge"]);
    expect(result.error).toBeUndefined();
  });

  describe("CEP Example: bioconda with base conda-forge", () => {
    const reg = registry({
      bioconda: { base: "conda-forge" },
      "conda-forge": {},
    });

    it("resolves base channel with higher priority", () => {
      const result = resolveChannelPriority(["bioconda"], reg);
      expect(result.order).toEqual(["conda-forge", "bioconda"]);
      expect(result.error).toBeUndefined();
    });

    it("preserves user order when both specified (agreeing)", () => {
      const result = resolveChannelPriority(
        ["conda-forge", "bioconda"],
        reg
      );
      expect(result.order).toEqual(["conda-forge", "bioconda"]);
    });
  });

  describe("CEP Example: label/rc overrides conda-forge", () => {
    const reg = registry({
      "conda-forge/label/rc": { overrides: "conda-forge" },
      "conda-forge": {},
    });

    it("resolves override channel with lower priority", () => {
      const result = resolveChannelPriority(
        ["conda-forge/label/rc"],
        reg
      );
      expect(result.order).toEqual([
        "conda-forge/label/rc",
        "conda-forge",
      ]);
    });
  });

  describe("CEP Example: transitive resolution", () => {
    const reg = registry({
      "my-channel": { base: "bioconda" },
      bioconda: { base: "conda-forge" },
      "conda-forge": {},
    });

    it("resolves transitive base chain", () => {
      const result = resolveChannelPriority(["my-channel"], reg);
      expect(result.order).toEqual([
        "conda-forge",
        "bioconda",
        "my-channel",
      ]);
    });
  });

  describe("CEP Example: combining base and overrides", () => {
    const reg = registry({
      "my-channel": { base: "conda-forge", overrides: "my-hotfixes" },
      "conda-forge": {},
      "my-hotfixes": {},
    });

    it("resolves with base higher and overrides lower", () => {
      const result = resolveChannelPriority(["my-channel"], reg);
      expect(result.order).toEqual([
        "conda-forge",
        "my-channel",
        "my-hotfixes",
      ]);
    });
  });

  describe("CEP Example: user-specified conflict", () => {
    const reg = registry({
      bioconda: { base: "conda-forge" },
      "conda-forge": {},
    });

    it("user order wins when conflicting with relation", () => {
      const result = resolveChannelPriority(
        ["bioconda", "conda-forge"],
        reg
      );
      // User says bioconda > conda-forge, relation says conda-forge > bioconda
      // User wins, relation edge is ignored
      expect(result.order).toEqual(["bioconda", "conda-forge"]);
      expect(result.ignoredEdges).toHaveLength(1);
      expect(result.ignoredEdges[0].source).toBe("base");
    });
  });

  describe("cycle detection", () => {
    it("detects a simple cycle", () => {
      const reg = registry({
        a: { base: "b" },
        b: { base: "a" },
      });
      const result = resolveChannelPriority(["a"], reg);
      expect(result.error).toBeDefined();
      expect(result.error!.type).toBe("cycle");
    });

    it("detects a transitive cycle", () => {
      const reg = registry({
        a: { base: "b" },
        b: { base: "c" },
        c: { base: "a" },
      });
      const result = resolveChannelPriority(["a"], reg);
      expect(result.error).toBeDefined();
      expect(result.error!.type).toBe("cycle");
    });
  });

  describe("deduplication", () => {
    it("does not duplicate a channel referenced multiple times", () => {
      const reg = registry({
        a: { base: "conda-forge" },
        b: { base: "conda-forge" },
        "conda-forge": {},
      });
      const result = resolveChannelPriority(["a", "b"], reg);
      const cfCount = result.order.filter(
        (c) => c === "conda-forge"
      ).length;
      expect(cfCount).toBe(1);
      expect(result.error).toBeUndefined();
    });
  });

  describe("max depth", () => {
    it("respects max depth limit", () => {
      const reg = registry({
        a: { base: "b" },
        b: { base: "c" },
        c: { base: "d" },
        d: {},
      });
      // With maxDepth=1, only 'b' is discovered (not c or d)
      const result = resolveChannelPriority(["a"], reg, 1);
      expect(result.channels).toContain("a");
      expect(result.channels).toContain("b");
      expect(result.channels).not.toContain("c");
      expect(result.channels).not.toContain("d");
    });
  });
});
