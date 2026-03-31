# Channel Relations in Repodata — Interactive Visualization

Interactive tool for exploring the channel relations resolution algorithm proposed in the [CEP (Conda Enhancement Proposal)](https://github.com/conda/ceps).

**[Try it live](https://baszalmstra.github.io/channel-relations-proto/)**

## What is this?

Conda channels can declare relationships to other channels in their `repodata.json`:

- **base** — a channel with *higher* priority (e.g. bioconda declares conda-forge as its base)
- **overrides** — a channel with *lower* priority (e.g. a label/rc channel overrides the main channel)

These relations form a directed acyclic graph (DAG). The resolution algorithm discovers related channels, handles conflicts with user-specified ordering, and produces a final linear priority order via topological sort.

This tool lets you:

- Define channels and their declared relations
- Specify the user's channel list (the `-c` flags)
- See the resulting DAG with color-coded edges
- Inspect the resolved channel priority order
- View the algorithm source code with syntax highlighting
- Share examples via URL

## Built-in examples

| Preset | What it demonstrates |
|--------|---------------------|
| bioconda + conda-forge | Basic `base` relation |
| Label: release candidates | `overrides` relation |
| Transitive chain | Chained base relations |
| Base + overrides combined | Both relation types on one channel |
| User conflict (user wins) | User ordering overrides declared relations |
| Override with base chain | Override layered on top of a base chain |
| Two overrides (chain) | Chained override declarations |
| Cycle (error) | Mutual base declarations |
| Cycle via override (error) | Mutual override declarations |
| Transitive cycle (error) | Three-channel cycle |

## Development

Requires [pixi](https://pixi.sh):

```sh
pixi run dev       # Start dev server
pixi run build     # Build static site to dist/
pixi run test      # Run algorithm unit tests
pixi run preview   # Preview production build
```

## Project structure

```
src/
  algorithm/       # Pure TypeScript — no DOM dependencies
    types.ts       # ChannelRelations, PriorityEdge, ResolutionResult
    resolve.ts     # Graph building, conflict detection, DFS topological sort
  renderer/        # dagre layout + d3.js SVG rendering
  ui/              # Presets, channel editor, controls
  main.ts          # Wires everything together
  __tests__/       # Vitest unit tests for the algorithm
```

## License

[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) — same as the CEP.
