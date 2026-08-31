# 3D Tactical Viewer — Test-Driven Development Strategy

This document defines the test structure expected by the implementation prompts. It is intentionally stricter than a normal module test plan because coordinate conversion, multiplayer synchronization, and visibility mistakes can create subtle or security-relevant failures.

## 1. Test goals

The test suite must prove four different things:

1. **Math correctness** — tactical coordinate, projection, distance, heading, pitch, and depth calculations are deterministic.
2. **Foundry contract correctness** — adapters use the expected Foundry v14 data semantics without leaking Foundry globals into pure code.
3. **State/synchronization correctness** — user actions create correct partial Document updates and hook-driven redraws never write state.
4. **UI/rendering correctness** — viewports display the right visible tokens, preserve user-local state, and remain responsive.

No single test layer is sufficient.

## 2. Test tooling

Recommended development-only tooling:

- Vitest for unit and integration-style tests.
- jsdom for HTML/controller tests where a browser DOM is required.
- Small hand-written Foundry fakes for Document, grid, Hook, settings, Scene, Token, and user APIs.
- Real Foundry v14 manual smoke testing for behavior that cannot be accurately reproduced by fakes.

Production/runtime code remains dependency-free.

If the repository already has a compatible test framework, reuse it rather than installing a second runner.

## 3. Test directories

Recommended layout:

```text
tests/
  unit/
    model/
    projection/
    persistence/
    rendering/
  integration/
    foundry/
    viewer/
    synchronization/
  fixtures/
    scenes/
    tokens/
    layouts/
  helpers/
    fake-foundry.js
    fake-grid.js
    fake-token.js
    fake-canvas-context.js
  manual/
    foundry-smoke.md
    multi-client.md
    performance.md
```

Tests must import production modules through the same public boundaries used by runtime code whenever practical.

## 4. Test pyramid

### Layer A — Pure unit tests

No `game`, `canvas`, `Hooks`, DOM, or Foundry globals.

Must cover:

- heading normalization;
- pitch normalization;
- Foundry-rotation conversion;
- 3D orientation vectors;
- Chebyshev distance;
- projection matrices;
- isometric depth keys;
- art fallback selection;
- layout migration functions;
- bounded/LRU layout pruning;
- coordinate arithmetic after Foundry values have been normalized by an adapter.

These tests should be fast enough to run after every edit.

### Layer B — Adapter tests with Foundry fakes

Use narrow fakes that expose only documented behavior needed by the adapter.

Must cover:

- square-grid eligibility;
- `getOffset`, `getCenterPoint`, `getTopLeftPoint`, and `getSnappedPoint` usage;
- 1x1 and multi-cell token centers;
- Scene padding/offset cases;
- elevation/grid-distance conversion;
- TokenDocument permission checks;
- hidden/visible token filtering;
- Scene flags;
- token flags;
- user/client/world setting registration;
- partial document updates.

The fake must not conveniently provide behavior that production Foundry does not provide.

### Layer C — Service/event integration tests

Test multiple production services together.

Must cover:

- explicit action -> update service -> fake TokenDocument update;
- document update -> event coordinator -> one rAF invalidation;
- `moveToken` + `updateToken` burst does not create duplicate write or pathological redraw;
- render path never calls update;
- stale interaction conflicts;
- unrelated concurrent field edits survive;
- token deletion clears local selection;
- visibility changes invalidate hit testing and labels.

### Layer D — UI/controller tests

Use DOM/jsdom only for controller behavior.

Must cover:

- 1/2/3/4 panel state;
- projection dropdown changes;
- hidden panels retain configuration;
- splitter state;
- Link Selection;
- Link Center;
- Link Zoom;
- focus/keyboard handling;
- controls disable for unauthorized or locked tokens;
- accessibility names for icon-only controls.

Do not attempt pixel-perfect Canvas testing in jsdom.

### Layer E — Renderer tests

Use a fake Canvas2D context or a render-command abstraction.

Assert semantic draw commands:

- visible grid range;
- token placement;
- culling;
- selected outline;
- orientation vector;
- stack indicator;
- labels filtered by visibility;
- high-DPI transforms.

Avoid brittle screenshot tests for every small change.

A small number of browser/manual visual snapshots can be used for final regression coverage.

### Layer F — Real Foundry v14 smoke tests

Required before declaring milestones complete.

Use an actual test World with:

- square grid;
- nonzero Scene padding;
- grid distance 5;
- at least one 1x1 token;
- one 2x2 token;
- negative elevation token;
- off-step elevation token;
- hidden token;
- player-owned token;
- GM-only token.

Real Foundry tests are the authority when a fake disagrees.

## 5. Baseline test command contract

The implementation should converge on commands such as:

```text
npm test
npm run test:watch
npm run test:unit
npm run test:integration
```

If coverage tooling is installed:

```text
npm run test:coverage
```

Every prompt must leave `npm test` green.

## 6. Golden coordinate fixtures

Maintain explicit fixtures rather than deriving expected values from the production implementation.

Example fixture categories:

```text
1x1 token at grid cell 0,0
1x1 token at grid cell 5,7
2x2 token centered over expected footprint
3x2 token
scene with padding
scene with grid distance 5
scene with grid distance 10
elevation -10, 0, 5, 15
off-step elevation 7.5
```

Expected tactical anchors and grid offsets must be hand-verified against Foundry behavior.

## 7. Orientation truth table

All 8 headings x 5 pitches = 40 orientation states must produce finite vectors.

At minimum assert exact/near-exact values for cardinal states:

```text
000/0  -> (0,-1,0)
090/0  -> (1,0,0)
180/0  -> (0,1,0)
270/0  -> (-1,0,0)
*/+90  -> (0,0,1)
*/-90  -> (0,0,-1)
```

Test all states through every projection to guarantee finite screen vectors.

## 8. Projection round-trip tests

For orthographic views, define the visible axes and hidden-axis preservation explicitly.

Examples:

```text
Top drag changes X/Y, preserves Z.
North drag changes X/Z, preserves Y.
East drag changes Y/Z, preserves X.
```

For South/West, test mirroring independently rather than assuming the North/East implementation can simply negate one screen coordinate.

Isometric projections do not need inverse drag tests in v1.

## 9. Movement tests

For each interactive orthographic projection, cover:

- one-cell positive axis;
- one-cell negative axis;
- diagonal;
- vertical step;
- multi-cell token footprint;
- near Scene boundary;
- unauthorized token;
- locked token;
- off-grid starting elevation;
- Foundry-rejected update.

Verify the generated update is partial and does not overwrite unrelated fields.

## 10. Synchronization invariant tests

Add tests specifically designed to fail if render/event code mutates documents.

A fake TokenDocument should count update calls.

Scenario:

```text
external update event
 -> coordinator invalidates
 -> renderer draws
```

Expected:

```text
TokenDocument.update call count = 0
```

Scenario:

```text
user drag commit
```

Expected:

```text
TokenDocument.update call count = 1
```

This is a critical regression test.

## 11. Hook de-duplication tests

Simulate a movement update that results in:

1. `updateToken`
2. `moveToken`

or the actual order observed in Foundry.

Expected:

- canonical state read after update;
- one coalesced render per animation frame;
- no second document write;
- no duplicate notification to the user.

Do not test by relying only on timer sleeps; inject a scheduler/rAF fake.

## 12. Visibility/security tests

This is a release gate.

For a player:

- hidden token must not render;
- token outside permitted vision must not render;
- its name must not appear;
- it must not contribute to stack count;
- it must not be hit-testable;
- it must not appear in accessible summaries;
- it must disappear immediately after becoming invisible.

For a GM, verify the chosen GM behavior separately.

Any visibility leak is a failing release test.

## 13. Concurrency tests

Same-field conflict:

```text
A begins Top drag at x=100,y=100
B moves token to x=200,y=100
A drops old drag
```

Expected:

- A's stale update is canceled;
- authoritative B position remains;
- A receives a concise conflict message.

Unrelated-field concurrency:

```text
A changes pitch
B changes x/y
```

Expected:

- both survive because updates are partial.

## 14. User-setting scope tests

Verify registration uses:

- `user` for panel count/views/link preferences;
- `client` for DPR/performance/debug-render settings;
- `world` only for explicit world defaults.

A test should fail if panel layout is accidentally registered as client scope.

## 15. Layout migration tests

For each schema version:

- old fixture migrates to current;
- migration is idempotent;
- unknown safe fields are not needlessly destroyed;
- corrupt entry falls back without losing all other Scene layouts;
- pruning removes least-recently-used entries when the configured bound is exceeded.

## 16. Artwork tests

Cover fallback in strict order:

1. exact per-view custom;
2. explicitly permitted mirrored opposite;
3. single custom tactical icon;
4. selected generic preset;
5. generic marker.

Broken asset load must move to the next fallback and must be memoized to avoid retrying every frame.

Orientation vector must remain present even if art is missing.

## 17. Overlap/depth tests

Orthographic:

- multiple visible tokens at same projected location create stack count;
- invisible token does not affect count;
- chooser exposes hidden-axis coordinate;
- deleting one token updates count.

Isometric:

- depth sort is deterministic for all four camera choices;
- selected outline remains visible;
- equal-depth tie-breaker is stable.

## 18. Performance tests

The automated suite should include algorithmic/per-render work checks, but actual performance is measured in Foundry.

Manual benchmark matrix:

```text
10 tokens / 1 panel
50 tokens / 2 panels
50 tokens / 4 panels
100 tokens / 4 panels
```

Record:

- event-to-visible-update latency;
- repaint duration;
- idle CPU;
- memory;
- image-cache size.

Pass criteria for the first release should be chosen from actual Phase 0 measurements, not invented before profiling.

## 19. Manual Foundry milestone gates

### Gate A — Foundry bootstrap

- module recognized;
- no console errors;
- init/ready lifecycle works.

### Gate B — coordinates

- 1x1 and 2x2 token tactical center matches real Foundry grid;
- one grid step remains one grid step with Scene padding.

### Gate C — document synchronization

- GM move updates player viewer;
- player-owned move updates GM viewer;
- no loop.

### Gate D — visibility

- hidden/fogged token is absent from player viewer.

### Gate E — multi-panel

- two clients use different panel layouts without affecting each other.

### Gate F — release candidate

Run full acceptance matrix from the specification.

## 20. Definition of done for every prompt

A prompt is complete only if:

- baseline suite was green before the change, or unrelated pre-existing failures were explicitly documented;
- new behavior has a failing test first;
- new production code is actually invoked by the runtime or an already-integrated service;
- no dead speculative module is added;
- focused tests pass;
- full suite passes;
- any manual smoke step in the prompt passes;
- `todo.md` is updated;
- changed files and test results are summarized.

A prompt is not complete merely because code was generated.
