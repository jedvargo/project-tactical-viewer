# 3D Tactical Viewer — Step-by-Step Implementation Blueprint

This blueprint converts `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md` into a safe test-driven build sequence for a code-generation LLM.

The decomposition was deliberately performed in multiple rounds. The final prompt-sized steps are smaller than the high-level feature list because the highest-risk parts of this module are not the visible UI features; they are Foundry coordinate semantics, visibility, permissions, and event synchronization.

## 1. Inputs and source-of-truth order

Code agents must resolve conflicting instructions in this order:

1. Current explicit implementation prompt.
2. `implementation_contract.md`.
3. `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
4. `test_strategy.md`.
5. `todo.md`.
6. Existing repository behavior/tests.

If official current Foundry v14 documentation contradicts an assumption in these documents, the coding agent should stop that assumption from propagating and document the discrepancy.

## 2. Architecture to preserve

The project must converge on this dependency direction:

```text
Foundry integration
      |
      v
Foundry adapters/services
      |
      v
Canonical tactical state/update services
      |
      +------------------+
      |                  |
      v                  v
Projection engine    Persistence
      |
      v
Viewer/controller state
      |
      v
Renderer + input controllers
      |
      v
ApplicationV2 shell
```

Rendering is downstream of game state.

No renderer or hook handler may become a second source of truth.

## 3. Decomposition round 1 — six large phases

The first pass produces six natural project phases.

### Phase A — Foundation

- repository/module manifest;
- test framework;
- constants;
- core math;
- Foundry lifecycle.

### Phase B — Foundry state model

- Scene eligibility;
- coordinate conversion;
- elevation;
- token tactical state;
- permissions;
- visibility;
- persistence;
- update service;
- event coordinator.

### Phase C — Orthographic MVP

- ApplicationV2;
- one Canvas2D panel;
- Top projection;
- pan/zoom/selection;
- Top movement;
- heading;
- North movement;
- pitch.

### Phase D — Multi-view system

- East/South/West;
- 1–4 panels;
- view dropdowns;
- splitters;
- linked selection;
- linked center;
- linked zoom.

### Phase E — Isometric/art/configuration

- isometric projections;
- depth/overlap;
- generic art;
- custom art;
- Scene/Token/Prototype Token configuration UI.

### Phase F — hardening/release

- accessibility;
- responsive behavior;
- lifecycle;
- external updates;
- migrations;
- performance;
- packaging;
- localization;
- full acceptance.

This is too coarse for safe code generation.

## 4. Decomposition round 2 — fifteen work packages

The second pass splits risk domains from visible features.

| WP | Work package | Main risk |
|---|---|---|
| 1 | Module/test scaffold | build/runtime mismatch |
| 2 | Tactical math | convention errors |
| 3 | Scene eligibility | invalid grid assumptions |
| 4 | Coordinate/elevation adapters | position drift |
| 5 | Projection engine | mirrored-axis errors |
| 6 | Persistence | wrong Foundry scope/migration |
| 7 | Tactical state | prototype/placed-token confusion |
| 8 | Visibility/permissions | information leak |
| 9 | Update/concurrency | lost updates |
| 10 | Hook coordinator | loops/double redraw |
| 11 | Viewer/render shell | ApplicationV2/canvas integration |
| 12 | Orthographic interaction | projection-to-world inverse errors |
| 13 | Multi-panel linking | UI-state coupling |
| 14 | Isometric/art/configuration | depth/art complexity |
| 15 | Hardening/release | interoperability/performance |

Several of these are still too large. For example, "coordinate/elevation adapters" combines three independent failure modes, and "orthographic interaction" would make a code agent jump directly from static rendering to full XYZ movement.

## 5. Decomposition round 3 — final prompt-sized steps

The final implementation plan contains 31 prompts.

Each prompt produces one integrated increment and a green suite.

| Prompt | Increment | Depends on | Milestone |
|---:|---|---|---|
| 00 | Repository + module + test scaffold | — | Foundation |
| 01 | Constants, view registry, runtime container | 00 | Foundation |
| 02 | Tactical heading/pitch/vector/distance math | 01 | Foundation |
| 03 | Scene eligibility and settings registration | 01 | Foundry core |
| 04 | Token anchor and square-grid X/Y adapter | 03 | Foundry core |
| 05 | Elevation/Z adapter and off-grid state | 04 | Foundry core |
| 06 | Orthographic projection math | 02,05 | Projection |
| 07 | Isometric projection/depth math | 06 | Projection |
| 08 | User/client persistence + migration/pruning | 03 | Persistence |
| 09 | Tactical token state + prototype/placed flags | 04,05 | State |
| 10 | Visibility and permission service | 09 | Security gate |
| 11 | Tactical update service + stale-edit conflicts | 10 | Write path |
| 12 | Foundry hook/event coordinator + rAF batching | 11 | Sync gate |
| 13 | ApplicationV2 viewer shell + one panel | 08,12 | Viewer |
| 14 | Top Canvas2D grid/token renderer | 06,10,13 | Visible MVP |
| 15 | Panel selection, pan, zoom, hit testing | 14 | Viewer input |
| 16 | Top movement commit + heading editing | 11,15 | XY editing |
| 17 | North X/Z movement + pitch editing | 16 | XYZ MVP |
| 18 | South/East/West rendering and movement | 17 | Orthographic complete |
| 19 | 1–4 panel layouts, splitters, view dropdowns | 18 | Multi-panel |
| 20 | Linked selection, center, zoom | 19 | Synchronized UI |
| 21 | Four isometric views + orientation vectors | 07,20 | Isometric |
| 22 | Overlap stacks + isometric depth/selection | 21 | Spatial clarity |
| 23 | Generic tactical art asset manager | 22 | Artwork |
| 24 | Custom art/fallback/mirroring | 23 | Artwork |
| 25 | Scene + Token + Prototype Token configuration UI | 24 | Configuration |
| 26 | Scene lifecycle, open/close/reopen, external updates | 25 | Lifecycle |
| 27 | Accessibility, keyboard alternatives, responsive UI | 26 | UX |
| 28 | Rendering performance/culling/cache hardening | 27 | Performance |
| 29 | Migration/error/reconnect/interoperability hardening | 28 | Reliability |
| 30 | Packaging, localization, documentation, full acceptance | 29 | Release candidate |

This is the prompt sequence used by `prompt_plan.md`.

## 6. Why the final steps are right-sized

### Coordinate work is intentionally split

Scene eligibility, X/Y anchor conversion, and Z/elevation are separate prompts.

If all three were implemented together, a bad coordinate assumption could be hidden behind working-looking UI.

### Security lands before the renderer

Visibility and permission services are implemented before token rendering.

This prevents a temporary development renderer from accidentally becoming the basis of a player-visible information leak.

### The write path exists before drag UI

The update service and hook coordinator exist before user movement is enabled.

That means Top dragging wires into an already-tested single write path rather than embedding `TokenDocument.update()` inside a pointer handler.

### One interactive side view proves XYZ before all views

North is implemented before East/South/West.

Once Top + North can edit X/Y/Z/heading/pitch correctly, the product concept is proven. Additional orthographic cameras are then controlled variants, not simultaneous new concepts.

### Multi-panel comes after each individual panel is trustworthy

The application begins as one panel.

Panel multiplication does not occur until Top and vertical editing are independently green.

This prevents multi-panel state bugs from obscuring projection bugs.

### Isometric is late and read-only

Isometric math is unit-tested early, but its UI is added only after linked orthographic panels work.

It remains non-interactive for movement.

### Artwork follows functional geometry

Generic/custom sprites do not precede coordinate/orientation correctness.

A simple schematic token should be enough to finish movement and synchronization first.

## 7. Critical path

The critical technical path is:

```text
00 -> 01 -> 03 -> 04 -> 05 -> 09 -> 10 -> 11 -> 12
                                      |
02 -> 06 -----------------------------+
                                      |
08 ---------------------------------->13 -> 14 -> 15 -> 16 -> 17
                                                         |
                                                         v
18 -> 19 -> 20 -> 21 -> 22 -> 23 -> 24 -> 25 -> 26 -> 27 -> 28 -> 29 -> 30
```

Prompt 07 can be completed after Prompt 06 and before Prompt 21.

## 8. Release gates

### Gate 0 — module boots

After Prompt 00:

- Foundry recognizes module;
- entrypoint loads;
- test runner works.

### Gate 1 — coordinate proof

After Prompt 05:

- 1x1 and multi-cell tokens map correctly;
- Scene padding does not cause drift;
- elevation converts correctly.

If this fails in real Foundry, stop. Do not build the UI on uncertain coordinates.

### Gate 2 — security/write-path proof

After Prompt 12:

- visibility filtering works;
- permission checks work;
- one explicit action means one document write;
- hook events only invalidate/redraw;
- stale same-field edit is rejected.

### Gate 3 — minimum useful 3D combat

After Prompt 17:

- Top changes X/Y;
- North changes X/Z;
- heading and pitch work;
- both projections share one TokenDocument.

At this point the core concept should be usable even before four panels and isometric art exist.

### Gate 4 — full panel system

After Prompt 20:

- 1–4 panels;
- arbitrary fixed views;
- linked selection/center/zoom;
- per-user layout.

### Gate 5 — release feature complete

After Prompt 25:

- all fixed projections;
- schematic generic/custom art;
- Scene/token configuration.

### Gate 6 — release candidate

After Prompt 30:

- performance;
- migration;
- accessibility;
- lifecycle;
- packaging;
- complete manual multi-client acceptance.

## 9. Per-prompt implementation loop

Every prompt follows the same loop.

```text
1. Read current spec/contract/todo.
2. Run current full test suite.
3. Inspect only files relevant to the prompt.
4. Add failing tests.
5. Confirm failure is the expected missing behavior.
6. Implement the smallest production change.
7. Wire the change into the runtime.
8. Run focused tests.
9. Run full tests.
10. Run prompt-specific Foundry/manual smoke test when required.
11. Check git diff for scope creep, dead code, debugging output, and accidental API changes.
12. Update todo.md.
13. Report changed files, tests, and remaining risks.
```

## 10. No-orphan rule

A new module/class/function must satisfy at least one of these in the same prompt:

- imported by the current runtime;
- used by an already-integrated service;
- used by the test harness as the implementation boundary for an immediately integrated next-layer call.

Do not create "future" managers, controllers, APIs, or placeholder files that nothing calls.

Examples:

Bad:

```text
Prompt 05 creates IsometricRenderer even though viewer does not exist.
```

Good:

```text
Prompt 07 adds pure isometric projection functions to the already-used ProjectionEngine.
```

Bad:

```text
Prompt 11 creates UpdateService but movement handlers continue calling token.update directly.
```

Good:

```text
Prompt 11 establishes UpdateService as the sole public write path before Prompt 16 adds drag.
```

## 11. File ownership discipline

To reduce agent churn:

### Foundry integration

```text
scripts/foundry/
```

Only code that touches Foundry globals/Documents/Hooks directly.

### Pure model/math

```text
scripts/model/
scripts/projection/
```

No `game`, `canvas`, `Hooks`, or DOM globals at import time.

### Viewer/controller

```text
scripts/viewer/
```

Owns panel/user interaction state, not canonical token state.

### Rendering

```text
scripts/rendering/
```

Consumes resolved visible tactical state; never performs Document writes.

### Persistence

```text
scripts/persistence/
```

Owns settings schema/migrations/pruning.

## 12. Branch/commit strategy

A practical approach is one commit per prompt or one small prompt group per reviewable branch.

Suggested commit style:

```text
P04: add square-grid token anchor adapter
P05: map elevation to tactical Z
P06: add orthographic projection engine
```

Do not combine unreviewed Prompt 04–10 changes into one commit; that eliminates the main safety benefit of this plan.

## 13. Review checklist after each prompt

Review the diff for:

- new Foundry globals leaking into pure code;
- duplicated coordinate or heading conversion;
- renderer writes;
- direct `TokenDocument.update()` outside update service;
- visibility checks omitted from a render/hit-test path;
- panel state stored on Scene/Token;
- shared state stored in user settings;
- unbounded cache or layout map;
- new runtime dependencies;
- silent snapping of external data;
- private/internal Foundry API use;
- speculative later-feature code.

## 14. Definition of an implementation milestone

A milestone is not "all files for the feature exist."

It is complete only when a user-facing vertical slice works.

Examples:

**Prompt 14 milestone:** Open viewer -> see Top grid -> see only visible tactical tokens at correct tactical positions.

**Prompt 16 milestone:** Drag a visible owned token in Top -> one Foundry update -> all current representations redraw -> external movement is also reflected.

**Prompt 17 milestone:** Move the same token vertically in North -> elevation updates -> Top retains X/Y -> pitch can be changed -> shared state survives multi-client update.

## 15. Final architecture check before release

Before Prompt 30 is declared complete, verify these questions:

1. Is there still exactly one authoritative TokenDocument per object?
2. Can any renderer/hook update a TokenDocument? It must not.
3. Can any player infer a hidden token from the custom viewer? They must not.
4. Does a user's panel layout change another user's panel layout? It must not.
5. Does changing browser/device settings affect the user's other clients? Only user-scoped preferences should.
6. Can the module be disabled without damaging normal Foundry token data?
7. Can generic art render every tactical token even when all custom assets fail?
8. Can a user fight a basic XYZ battle using only Top + North?
9. Do all nine declared view choices work?
10. Does idle viewer CPU settle instead of continuously repainting?
11. Can the release be installed as a normal Foundry module with no external module dependency?
