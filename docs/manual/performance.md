# Tactical Viewer Performance Profile

Prompt 28 profile date: 2026-09-01.

Pre-change baseline: `npm test` passed 41 test files and 287 tests.

The available workspace does not contain a linked Foundry VTT v14 executable or
test World, so these are deterministic renderer measurements using the existing
Foundry-shaped square-grid fake. They are engineering measurements, not a
replacement for the required browser/Foundry smoke profile.

Environment: Node v24.18.0. The harness rendered 30 measured frames after five
warm-up frames with a no-op Canvas2D context, a 100x100-cell square grid,
800x600 CSS-pixel panels, DPR 1, generic marker art already decoded, and all
overlays enabled. The panel views were Top, North, East, and West as available.

| Tokens / panels | Median scheduled repaint | p95 repaint | Static grid cache | Static surface cache |
| --- | ---: | ---: | ---: | ---: |
| 10 / 1 | 0.067 ms | 0.139 ms | 34 hits / 1 miss | 34 hits / 1 miss |
| 50 / 2 | 0.267 ms | 0.399 ms | 68 hits / 2 misses | 68 hits / 2 misses |
| 50 / 4 | 0.502 ms | 0.561 ms | 136 hits / 4 misses | 136 hits / 4 misses |
| 100 / 4 | 0.949 ms | 1.211 ms | 136 hits / 4 misses | 136 hits / 4 misses |

The release target selected for the real Foundry/browser profile is no more
than 16 ms p95 for one coalesced repaint at 100 tokens / 4 panels, with zero
scheduled repaint frames while idle. The synthetic profile is comfortably
below that budget, but it does not measure browser image decode, Foundry DOM
layout, or real Canvas2D rasterization.

The renderer keeps at most eight static grid/background layers per viewer. The
decoded image cache remains bounded by `AssetManager`'s existing 64-entry LRU.
The existing optional client DPR setting was not tightened based on this
profile; real high-DPR Foundry measurements should determine whether a lower
device limit is needed.

Debug counters are opt-in through `Canvas2DRendererV1({ debug: true })` and are
read through `getDebugMetrics()`. No console logging or continuous sampling is
enabled in the production path.
