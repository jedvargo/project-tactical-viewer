
# 3D Tactical Viewer — Code-Generation Prompt Plan

These prompts are intended to be run sequentially against the same repository.

They are deliberately incremental. Do not skip ahead unless the dependency table in `implementation_blueprint.md` says the skipped prompt is independent and its outputs are already present and tested.

The implementation agent should treat each prompt as a bounded coding task, not as permission to redesign the application.

Each prompt is fenced as `text` so it can be copied directly into a code-generation LLM.

---

## Prompt 00 — Create the module and test scaffold

```text
You are implementing Prompt 00 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 00 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 01.

Goal: establish a valid, installable Foundry v14 module repository and a repeatable automated-test baseline without implementing Tactical Viewer features yet.

Required work:
- Create or normalize the repository structure described by the spec.
- Add a valid root `module.json` whose `id` is `tactical-3d-viewer`, with explicit Foundry v14 compatibility fields and an `esmodules` entry for the main module entrypoint.
- Add `scripts/main.js` with only the minimal Foundry lifecycle needed to prove the module initializes. Keep references to Foundry globals inside runtime functions/hooks, not at pure-module import time.
- Add `package.json` for development/testing. Prefer Vitest; jsdom may be a dev-only dependency for later UI tests. No package may be required at Foundry runtime.
- Add scripts for at least `test`, `test:unit`, and `test:integration`.
- Create `tests/unit`, `tests/integration`, `tests/helpers`, and `tests/fixtures`.
- Add the smallest fake Foundry helper necessary to test lifecycle registration without pretending to implement the whole Foundry API.
- Add a manifest validation test and a lifecycle smoke test.
- Add a minimal README development section explaining how to run tests and that real Foundry v14 is required for manual integration checks.

Do not add viewer classes, coordinate adapters, projections, or speculative managers yet.

Integration requirement:
`module.json` must load the actual `scripts/main.js`, and the test must import or exercise the same entrypoint/lifecycle registration boundary rather than testing a duplicate fake implementation.

Manual Foundry smoke check:
Install/link the module into a Foundry v14 test environment, enable it in a World, reload, and verify there are no module initialization errors in the browser console.
```

## Prompt 01 — Add constants, the fixed view registry, and runtime composition

```text
You are implementing Prompt 01 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 01 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 02.

Goal: establish the small set of shared constants and the runtime composition root that every later feature will use.

Required work:
- Add one constants module for:
  - module ID;
  - current persistent schema version;
  - allowed headings;
  - allowed pitches;
  - tactical axis convention;
  - exact nine fixed view IDs/names.
- Add a fixed projection/view registry containing exactly:
  `top`, `north`, `south`, `east`, `west`, `iso-ne`, `iso-se`, `iso-sw`, `iso-nw`.
- Ensure duplicate IDs are impossible and no hidden tenth view is introduced.
- Add a minimal runtime/composition object created by the Foundry entrypoint. It should be the place later services are attached, but do not add empty placeholder service classes.
- Expose a small read-only module API after initialization that can return module/version/view-registry information for diagnostics.
- Wire the entrypoint to this runtime rather than scattering module globals.

Tests:
- exact view list/order;
- unique IDs;
- headings/pitches values;
- runtime initializes once;
- diagnostic API sees the same registry used by production code.

Do not implement projection math yet.
```

## Prompt 02 — Implement tactical orientation and distance math

```text
You are implementing Prompt 02 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 02 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 03.

Goal: create and integrate the pure mathematical foundation for heading, pitch, orientation vectors, and cubic distance.

Required work:
- Implement pure functions for tactical heading normalization and nearest-45-degree snapping.
- Implement pitch validation/nearest supported pitch snapping.
- Implement the Foundry-rotation <-> tactical-heading conversion in one OrientationAdapter boundary. Foundry's documented rotation 0 is south-facing; validate the positive rotation direction against the target v14 API/runtime and encode it with tests.
- Implement the canonical orientation vector:
  `dx = sin(h)*cos(p)`, `dy = -cos(h)*cos(p)`, `dz = sin(p)`.
- Implement 3D Chebyshev distance `max(abs(dx), abs(dy), abs(dz))`.
- Preserve heading when pitch is +/-90.
- Do not write any Foundry Document state.

Tests:
- all eight headings;
- all five pitches;
- all 40 heading/pitch vector combinations are finite;
- cardinal vector truth table from `test_strategy.md`;
- Foundry rotation round trips at 0/90/180/270 and all tactical 45-degree headings;
- distance tests for axis, planar diagonal, and XYZ diagonal movement.

Integration requirement:
Attach/use the OrientationAdapter and distance functions through the existing runtime/module API so later services have one canonical implementation. Do not create a second conversion in any test helper.
```

## Prompt 03 — Implement Scene eligibility and correctly scoped settings

```text
You are implementing Prompt 03 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 03 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 04.

Goal: define when Tactical Viewer is allowed to operate and register the Foundry settings/Scene flag plumbing without building the viewer.

Required work:
- Add a SceneEligibilityService that accepts a Scene/grid abstraction and returns a structured result such as `{eligible, reason}`.
- v1 interactive eligibility requires a square grid, positive grid pixel size, positive grid distance, and valid Scene dimensions.
- Explicitly reject hex and gridless scenes with stable reason codes/messages.
- Add namespaced accessors for the shared Scene enable flag. Do not add SceneConfig UI yet.
- Register settings with correct scopes:
  - user scope for default panel count and link preferences;
  - client scope only for rendering/performance preferences;
  - world scope only for true world defaults if actually needed now.
- Do not store per-Scene layout data yet; Prompt 08 owns that.
- Wire SceneEligibilityService into the runtime and expose a diagnostic `isSceneEligible(scene)` API.

Tests:
- square, hex, gridless;
- zero/negative grid size/distance;
- setting scope assertions;
- Scene flag read/write helper behavior using fakes;
- no tactical enablement on an unsupported Scene.

Manual Foundry smoke check:
Call the diagnostic API against one square Scene and one unsupported Scene and verify the reason is correct.
```

## Prompt 04 — Implement token tactical anchors and square-grid X/Y conversion

```text
You are implementing Prompt 04 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 04 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 05.

Goal: prove correct mapping between Foundry token placement and tactical X/Y before any visual movement UI is built.

Required work:
- Add a CoordinateAdapter that is the only production code responsible for Foundry pixel/grid conversion.
- Treat TokenDocument x/y as top-left pixels, never as the tactical center.
- Derive the tactical anchor from the token footprint center.
- Use documented square-grid functions such as `getOffset`, `getCenterPoint`, `getTopLeftPoint`, `getSnappedPoint`, or equivalent target-v14 public APIs.
- Do not assume the grid begins at canvas pixel 0,0.
- Implement conversion from a placed token to tactical X/Y/anchor.
- Implement conversion of a desired tactical X/Y grid-step delta back to the correct TokenDocument top-left x/y while preserving token footprint.
- Keep the adapter usable with 1x1 and multi-cell tokens.
- Avoid importing `canvas` into pure projection/model code; Foundry-specific grid access belongs in the adapter.

Tests:
- 1x1, 2x2, 3x2, and 1x3 tokens;
- origin, Scene padding/offset, center, and near-boundary fixtures;
- one tactical X or Y step shifts the anchor exactly one grid cell;
- round-trip does not accumulate drift;
- invalid/non-square grid fails through SceneEligibilityService.

Integration requirement:
Register the CoordinateAdapter with the runtime and have the diagnostic tactical-state path use it. Do not add drag handlers yet.

Manual Foundry Gate-1 partial check:
Compare calculated tactical anchors against actual Foundry positions for at least a 1x1 and 2x2 token on a Scene with nonzero padding.
```

## Prompt 05 — Implement elevation-to-Z conversion and off-grid elevation handling

```text
You are implementing Prompt 05 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 05 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 06.

Goal: complete canonical XYZ conversion and lock down the Foundry elevation semantics before projection UI exists.

Required work:
- Extend CoordinateAdapter or add a tightly related ElevationAdapter used by it.
- Define `tacticalZ = elevation / scene.grid.distance`.
- Define tactical Z -> Foundry elevation conversion.
- Preserve negative elevation.
- Detect whether elevation is exactly on the tactical Z step within a documented floating-point tolerance.
- Return off-grid metadata instead of silently rewriting external values.
- Define the explicit user-action behavior for an off-step starting elevation: tactical vertical movement should snap/advance according to the spec's documented rule, but mere rendering/state reads must not mutate it.
- Validate positive grid distance before conversion.

Tests:
- grid distance 1, 5, 10, and 100;
- negative, zero, positive;
- off-step values such as elevation 7.5 on distance 5;
- round trips;
- no document writes from conversion;
- tactical state now returns X/Y/Z coherently.

Manual Foundry Gate 1:
Validate a normal elevation, negative elevation, and off-step elevation in the real Foundry test Scene. If the real API semantics disagree with the spec, stop and document the discrepancy before moving forward.
```

## Prompt 06 — Implement the orthographic projection engine

```text
You are implementing Prompt 06 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 06 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 07.

Goal: add pure projection math for the five orthographic views, including inverse screen-to-visible-axis calculations needed later for drag movement.

Required work:
- Create a ProjectionEngine that consumes canonical tactical coordinates and a panel camera/focus/scale description.
- Implement `top`, `north`, `south`, `east`, and `west`.
- Keep screen-up as +Z in vertical views.
- Define visible axes, hidden axis, horizontal mirroring, and labels explicitly.
- Implement inverse mapping for the two visible axes so later drag handlers can propose a new world position while preserving the hidden coordinate.
- Projection math must be pure and independent of Canvas/DOM/Foundry.
- Use the same engine to project orientation vectors.

Tests:
- hand-authored points for each view;
- mirrored South/West expectations;
- projection/inverse round trips for visible axes;
- hidden-axis preservation;
- orientation-vector projection;
- finite results at negative coordinates and negative Z.

Integration requirement:
Register the ProjectionEngine in the runtime. Do not render anything yet.
```

## Prompt 07 — Implement fixed isometric projection and depth math

```text
You are implementing Prompt 07 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 07 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 08.

Goal: complete pure projection support for the four fixed isometric cameras while keeping isometric interaction read-only.

Required work:
- Add `iso-ne`, `iso-se`, `iso-sw`, `iso-nw` to the existing ProjectionEngine.
- Define each camera basis explicitly and consistently with the tactical +X/+Y/+Z convention.
- Project both world points and orientation vectors.
- Calculate a deterministic depth key using the same camera basis.
- Add a stable tie-breaker contract for equal depth.
- Do not implement inverse 3D mouse mapping or isometric dragging.

Tests:
- known origin/axis points for all four cameras;
- camera symmetry;
- finite projections for the 40 heading/pitch states;
- depth-order fixtures where near/far relationships are known;
- stable tie-breaking.

Integration requirement:
The existing runtime ProjectionEngine now supports all nine fixed view IDs. No new viewer code is introduced.
```

## Prompt 08 — Implement user/client persistence, migrations, and bounded per-Scene layouts

```text
You are implementing Prompt 08 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 08 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 09.

Goal: establish the correct persistence layer before UI state becomes complex.

Required work:
- Create a persistence service for user-local viewer preferences.
- Register a user-scoped setting containing:
  - default panel count;
  - default link selection/center/zoom;
  - bounded per-Scene layout entries.
- Add client-scoped settings only for machine-specific renderer preferences such as DPR cap/debug/performance mode if they are needed now.
- Do not put panel layout in client scope.
- Add explicit layout `schemaVersion`.
- Implement pure migration functions and LRU/last-used pruning to a documented bound (choose a value within the spec's recommended 25–50 range and make it a constant).
- Persistent per-Scene layout includes panel count, panel view IDs, splitter proportions, link options, and overlay choices.
- Do not persist transient pan/zoom/center in v1.
- Corrupt one-Scene data must fall back without deleting healthy entries for other Scenes.

Tests:
- setting scopes;
- defaults;
- migration from a v1 fixture to current;
- migration idempotency;
- invalid view IDs repaired safely;
- pruning behavior;
- user A and user B fake settings are independent.

Integration requirement:
Register PersistenceService in the runtime. No viewer exists yet, but runtime initialization must load validated defaults through this service rather than raw settings calls.
```

## Prompt 09 — Build TacticalTokenState and prototype/placed-token flag behavior

```text
You are implementing Prompt 09 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 09 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 10.

Goal: create the single computed tactical state object that renderers and controllers will consume.

Required work:
- Implement namespaced token-flag access for:
  - participation;
  - pitch;
  - tactical art configuration;
  - schema version.
- Support the same default tactical configuration on Prototype Token data where Foundry's normal prototype-copy behavior applies.
- Build `TacticalTokenState` from a placed TokenDocument plus CoordinateAdapter and OrientationAdapter.
- Include token/scene IDs, tactical anchor, X/Y/Z, elevation, heading, pitch, width/height/depth, off-grid indicators, and raw references only where necessary.
- Do not persist computed tactical X/Y/Z or heading as duplicate flags.
- Clearly distinguish prototype defaults from placed-token runtime position.
- Add safe defaults for missing/old flags.

Tests:
- enabled/disabled participation;
- missing pitch -> 0;
- invalid pitch normalized for display without mutation;
- prototype default fixture copied into a placed-token fixture;
- existing placed token is not magically changed when prototype fixture changes;
- multi-cell dimensions included.

Integration requirement:
Runtime diagnostic token-state calls must now go through TacticalTokenState rather than reading TokenDocument fields ad hoc.
```

## Prompt 10 — Add visibility and permission security services

```text
You are implementing Prompt 10 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 10 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 11.

Goal: make visibility and permissions mandatory dependencies before any tactical token is rendered or edited.

Required work:
- Implement a VisibilityService that answers whether a participating token is visible to the current user using the documented Foundry token/placeable visibility signal where available.
- Design a conservative fallback when a PlaceableObject is temporarily unavailable: for non-GMs, do not reveal a token merely because the TokenDocument exists.
- Implement a PermissionService using `TokenDocument.canUserModify` or the documented v14 equivalent for update actions.
- Surface `locked` and `lockRotation` state distinctly.
- Build a `getVisibleTacticalStates()` path that filters before rendering/hit testing.
- Ensure hidden token metadata is not included in render models, stack candidates, or accessible summaries.

Tests:
- GM/player;
- visible/hidden;
- placeable temporarily missing;
- owned/unowned;
- locked;
- lockRotation;
- hidden token cannot be hit tested or counted in a supplied overlap model.

Integration requirement:
Change the runtime's tactical-token enumeration so downstream code receives only current-user-visible tactical states by default. There must be no unfiltered renderer-facing enumeration API accidentally exposed.

Manual security smoke check:
In real Foundry, verify a token hidden from a player does not appear in the diagnostic visible-state list while the GM still sees the expected state. Treat any leak as a blocker.
```

## Prompt 11 — Create the sole TacticalUpdateService with optimistic conflict detection

```text
You are implementing Prompt 11 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 11 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 12.

Goal: establish one safe write path before any drag/edit UI can modify TokenDocuments.

Required work:
- Add TacticalUpdateService as the only application service allowed to perform tactical TokenDocument updates.
- Add methods for:
  - X/Y move;
  - X/Z move;
  - Y/Z move;
  - heading;
  - pitch.
- Each method builds the smallest partial update.
- Check permission and appropriate lock state before calling update.
- Accept an interaction snapshot containing the relevant starting fields.
- Immediately before commit, compare current document fields with the snapshot. If the same fields changed remotely, return a structured conflict result and do not update.
- Allow unrelated concurrent fields to coexist.
- Convert tactical Z through the elevation adapter.
- Convert tactical heading through the OrientationAdapter.
- Pitch updates only the namespaced flag.
- The service returns structured accepted/rejected/conflict results suitable for UI messages.

Tests:
- exact update payloads;
- update call count is one on success;
- zero on permission failure/conflict;
- same-field conflict canceled;
- X/Y remote change does not block an unrelated pitch update;
- locked movement vs lockRotation;
- off-grid elevation user action follows defined snapping rule;
- no renderer/hook dependency.

Integration requirement:
Expose all future write operations through this service in runtime. Add a test/fail-fast mechanism or code search guard if practical to keep direct token updates out of viewer/rendering directories.
```

## Prompt 12 — Implement the Foundry synchronization/event coordinator

```text
You are implementing Prompt 12 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 12 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 13.

Goal: prove that Foundry Document synchronization can invalidate the viewer safely without feedback loops.

Required work:
- Add a SynchronizationCoordinator responsible for registering/unregistering Foundry hooks.
- Listen to `moveToken` for completed movement.
- Listen to `updateToken` for relevant non-movement changes: rotation, module flags, participation, art, size, hidden/visibility-related state.
- Handle token create/delete if required to maintain current visible-state caches.
- Coalesce multiple notifications into one scheduled invalidation using an injectable `requestAnimationFrame`-style scheduler.
- Deduplicate the movement/update overlap by invalidation semantics rather than attempting a document rewrite.
- Publish a small internal invalidation event to current viewer consumers.
- On teardown/Scene transition, unregister or deactivate listeners cleanly.

Tests:
- external move -> invalidation;
- external rotation -> invalidation;
- pitch flag -> invalidation;
- irrelevant token field -> no unnecessary invalidation if safe;
- move/update event burst -> one scheduled repaint;
- hook path -> zero TokenDocument.update calls;
- token deletion clears matching local state through subscriber contract;
- teardown stops events.

Integration requirement:
Register the coordinator in the runtime and start it during the appropriate Foundry lifecycle. It can have a no-op subscriber until the viewer exists, but it must be the live event path, not dead future code.

Manual Gate 2:
With GM and player clients, change movement, rotation, and pitch flag externally and verify the second client receives the canonical Document changes without loops. Re-test player visibility.
```

## Prompt 13 — Build the ApplicationV2 Tactical Viewer shell with one panel

```text
You are implementing Prompt 13 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 13 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 14.

Goal: create the first real viewer application without tactical rendering complexity.

Required work:
- Implement `TacticalViewerApplication` using Foundry v14 `ApplicationV2` and the preferred Handlebars mixin/template pattern if appropriate for the target API.
- Open it only for eligible/enabled Scenes through an explicit runtime method; do not add SceneConfig UI yet.
- Build exactly one panel initially.
- Mount one HTML `<canvas>` and a compact panel toolbar shell.
- Use the existing user PersistenceService to obtain initial panel/view preferences, but force one panel for this prompt if needed.
- Add `ResizeObserver` handling and high-level application teardown.
- Connect SynchronizationCoordinator invalidation to the viewer's `requestRender()`/viewport invalidation path.
- Do not implement grid/token drawing yet.
- Ensure the viewer does not run a continuous animation loop while idle.

Tests:
- application/controller construction with faked ApplicationV2 host where practical;
- one panel state;
- resize event updates viewport dimensions;
- multiple invalidations in a frame coalesce;
- close detaches viewer subscriber;
- no TokenDocument writes.

Manual smoke:
Open and close the real Foundry application repeatedly and switch Scenes. It should not leak obvious listeners or throw console errors.
```

## Prompt 14 — Render the Top tactical grid and visible tokens

```text
You are implementing Prompt 14 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 14 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 15.

Goal: make the module visibly useful for the first time: a correct read-only Top tactical projection.

Required work:
- Implement a Canvas2D renderer interface and concrete v1 renderer.
- Render the Top grid from ProjectionEngine/CoordinateAdapter data rather than re-deriving grid math.
- Render a simple schematic token marker for every visible participating TacticalTokenState.
- Do not load custom art yet.
- Draw an authoritative heading/pitch orientation indicator, at least a forward heading line/arrow and pitch badge.
- Add optional token name/elevation labels from the render model.
- Implement correct CSS-size/backing-store scaling for devicePixelRatio.
- Implement baseline viewport culling.
- Cache static grid/background where practical.
- The render path must only receive visibility-filtered state.
- Do not call `TokenDocument.update()` from any rendering function.

Tests:
- semantic draw-command/fake-context tests for grid and token coordinates;
- high-DPI transform;
- offscreen token culled;
- invisible token never reaches draw calls;
- orientation vector/label at expected Top direction;
- render causes zero document updates.

Manual smoke:
Open the real viewer on a square Scene and visually compare 1x1 and 2x2 tactical token centers to the native Foundry Scene.
```

## Prompt 15 — Add local selection, hit testing, pan, and zoom

```text
You are implementing Prompt 15 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 15 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 16.

Goal: make one Top panel navigable without enabling game-state edits yet.

Required work:
- Add panel input/controller logic using Pointer Events.
- Implement local tactical selection using only visible rendered tokens.
- Do not call native Foundry token `control()` when selecting.
- Implement panning and zooming around a stable pointer/focus point.
- Define logical zoom as pixels per tactical cell.
- Add zoom +/- and reset controls in the panel toolbar.
- Implement hit testing that handles token marker size and ignores culled/invisible tokens.
- Update selected-token accessible/readout state in the viewer shell.
- Keep selection/pan/zoom strictly viewer-local.

Tests:
- select visible token;
- invisible token cannot be selected;
- empty-space click clears selection according to chosen behavior;
- pan changes view focus, not game coordinates;
- zoom preserves target focus;
- zoom clamps to safe min/max;
- no native control or TokenDocument write.

Manual smoke:
Select, pan, and zoom around a Scene with multiple tokens; verify normal Foundry token vision/control does not change just because Tactical Viewer selection changes.
```

## Prompt 16 — Enable Top X/Y movement and heading editing

```text
You are implementing Prompt 16 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 16 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 17.

Goal: complete the first interactive tactical projection using the already-tested update service.

Required work:
- Add token drag preview in Top for users permitted to move the selected token.
- Convert pointer destination through ProjectionEngine and CoordinateAdapter; snap using the documented square-grid path.
- Top drag may update X/Y only and must preserve elevation/Z.
- Capture the relevant interaction-start fields for conflict detection.
- On drop, call TacticalUpdateService exactly once.
- On rejected/conflict update, remove preview and restore canonical render state with a concise UI message.
- Add discrete heading +/-45 controls/handle to Top.
- Heading edits must use TacticalUpdateService and respect `lockRotation`.
- External Foundry native moves/rotations must already flow back through the coordinator and redraw.
- Do not implement North/Z movement in this prompt.

Tests:
- preview only during drag;
- one-cell X/Y/diagonal moves;
- multi-cell token remains correctly anchored;
- hidden Z preserved;
- permission/locked/conflict cases;
- one document update per successful action;
- heading exactly snaps through OrientationAdapter;
- render/event redraw performs no extra write.

Manual smoke:
Move and rotate a token from Tactical Viewer and verify the native Foundry token moves/rotates. Then move/rotate the native token and verify Tactical Viewer follows.
```

## Prompt 17 — Add the North X/Z view and pitch editing

```text
You are implementing Prompt 17 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 17 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 18.

Goal: reach the minimum useful 3D-combat milestone by editing Z/elevation from a second synchronized projection.

Required work:
- Reuse the common renderer/controller framework to render a North X/Z panel.
- Render +Z upward and clearly label horizontal/vertical axes.
- Allow North drag to update X and elevation/Z while preserving Y.
- Convert vertical cells to elevation using Scene grid distance.
- Add discrete pitch controls for -90/-45/0/+45/+90.
- Pitch writes through TacticalUpdateService to the namespaced token flag.
- Add a compact off-grid elevation indicator for externally supplied off-step elevation.
- Keep Top and North representations synchronized through canonical TokenDocument state.
- Do not build multi-panel layout yet; the single panel may switch between Top and North using a temporary or real dropdown.

Tests:
- North projection positions;
- X-only, Z-only, and X/Z diagonal moves;
- Y preserved;
- negative Z;
- off-step starting elevation behavior;
- pitch permissions and all five values;
- Top state after North update is correct.

Manual Gate 3:
With two clients, move X/Y in Top, switch/use North to move X/Z and change pitch, and verify the other client sees the same Foundry token/elevation/pitch state. This gate must pass before multi-panel work.
```

## Prompt 18 — Complete South, East, and West orthographic interaction

```text
You are implementing Prompt 18 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 18 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 19.

Goal: finish all five orthographic tactical views using shared renderer/input/update code rather than copy/pasted per-view handlers.

Required work:
- Add South, East, and West rendering to the viewer.
- Reuse ProjectionEngine definitions from Prompt 06.
- North/South update X/Z and preserve Y.
- East/West update Y/Z and preserve X.
- Correctly mirror screen axes while keeping canonical tactical coordinates unchanged.
- Render heading/pitch indicators consistently for the camera side.
- Ensure input logic is projection-driven: the panel asks the projection which world axes it edits rather than branching into four duplicated drag implementations.
- Add the full fixed orthographic options to the panel dropdown.
- Keep isometric options disabled/hidden only if they are not yet renderable.

Tests:
- one movement test in every positive/negative visible axis;
- mirrored South/West screen direction;
- hidden coordinate preservation;
- heading/pitch vector projection;
- shared handler calls TacticalUpdateService once.

Manual smoke:
Switch the same panel among all five orthographic views and confirm a known token's position and orientation remain coherent.
```

## Prompt 19 — Implement user-configurable 1–4 panel layouts and resizable splitters

```text
You are implementing Prompt 19 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 19 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 20.

Goal: turn the single-panel viewer into the configurable multi-panel product without changing game-state semantics.

Required work:
- Add panel count controls for 1, 2, 3, and 4.
- Implement the default layouts from the spec:
  - 1: full panel;
  - 2: side-by-side;
  - 3: large primary + two stacked;
  - 4: 2x2.
- Add resizable splitters with sensible minimum panel dimensions.
- Each panel receives its own projection dropdown.
- Duplicate view choices are allowed.
- Preserve panel 1–4 configuration when panels are hidden by reducing count.
- Persist panel count, views, splitter proportions, and overlays through PersistenceService.
- Do not share layout changes with other users.
- All panels read the same canonical TacticalTokenState list and SynchronizationCoordinator invalidation.

Tests:
- transitions 1->2->3->4 and back;
- hidden panel config restoration;
- duplicate projections;
- splitter clamping;
- persistence save/load;
- user A and B fake layouts independent;
- one token document change invalidates all visible panels without duplicate writes.

Manual smoke:
Run GM and player with different panel counts and views. Changing one user's layout must not affect the other.
```

## Prompt 20 — Implement linked selection, 3D center, and logical zoom

```text
You are implementing Prompt 20 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 20 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 21.

Goal: synchronize view-state only where the user requests it.

Required work:
- Implement viewer-wide Link Selection.
- Implement a shared logical 3D focus `{x,y,z}` for Link Center.
- Panning Top updates focus X/Y and preserves Z.
- Panning North/South updates X/Z and preserves Y.
- Panning East/West updates Y/Z and preserves X.
- Unlinked panels maintain independent focus.
- Implement Link Zoom using logical pixels-per-tactical-cell, not copied CSS transforms.
- Isometric-equivalent scale will be consumed later but shared scale data should already support it.
- Persist the three link toggles, not transient focus/zoom.
- Selection linking remains current-user only.

Tests:
- selection linked/unlinked;
- each projection updates only visible focus axes;
- hidden focus coordinate preserved;
- zoom linked/unlinked;
- zoom across differently sized panels remains logically equivalent;
- no game-state writes.

Manual Gate 4:
Use at least three panels on one client and a different layout on a second client. Link behavior must be local and coherent.
```

## Prompt 21 — Render the four fixed isometric views

```text
You are implementing Prompt 21 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 21 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 22.

Goal: add the spatial overview after orthographic interaction is stable.

Required work:
- Enable `iso-ne`, `iso-se`, `iso-sw`, and `iso-nw` in every panel dropdown.
- Render the isometric cubic grid using the existing ProjectionEngine.
- Render visible tactical tokens at projected XYZ positions.
- Render the authoritative projected heading/pitch vector for every token.
- Integrate linked selection, linked center, and linked zoom.
- Allow selection, pan, and zoom.
- Explicitly prevent direct token drag movement in isometric views; use cursor/UI feedback that makes this clear.
- Do not invent a pseudo-inverse 3D mouse mapping.

Tests:
- all four views can be selected;
- token positions match projection fixtures;
- orientation vectors correct;
- link center/zoom behavior;
- attempt to drag token does not call TacticalUpdateService;
- visibility filter still applies.

Manual smoke:
Compare a small three-token formation across Top/North/Isometric and rotate/change pitch of tokens through orthographic views. Isometric should update without being editable.
```

## Prompt 22 — Handle overlapping projections and deterministic depth

```text
You are implementing Prompt 22 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 22 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 23.

Goal: make projections usable when multiple 3D positions collapse to one 2D location.

Required work:
- Apply ProjectionEngine depth keys to isometric draw ordering.
- Add deterministic tie-breaking.
- Detect projected overlap/near-overlap in orthographic panels.
- Render a visible-only stack count.
- Clicking/tapping an overlap provides an accessible chooser or deterministic cycle through visible candidates.
- Show the relevant hidden-axis coordinate in the chooser.
- Invisible tokens must not affect stack count, chooser entries, hover state, or accessibility labels.
- Selected token outline/highlight must remain visible even when partly occluded, without changing canonical draw order.

Tests:
- known isometric near/far ordering in all four cameras;
- stable equal-depth tie;
- 2/3-token overlap;
- invisible overlapping token excluded;
- delete/visibility transition updates stack;
- keyboard-selectable chooser.

Manual smoke:
Create tokens sharing X/Y but different Z and tokens sharing an orthographic projection but different hidden-axis positions; verify selection remains understandable.
```

## Prompt 23 — Add the generic tactical asset manager and built-in fallbacks

```text
You are implementing Prompt 23 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 23 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 24.

Goal: replace schematic placeholder markers with reliable generic tactical art without risking rendering correctness.

Required work:
- Implement AssetManager as the single image-loading/cache boundary.
- Add built-in generic presets at minimum:
  - ship;
  - object;
  - creature;
  - marker.
- Use module-owned static images or a module-owned atlas. Do not add a runtime dependency.
- Lazy-load only assets required by currently visible panels/tokens.
- Cache decoded image sources.
- Memoize failures so a broken path is not retried every frame.
- Bound cache growth or provide safe cache lifecycle cleanup.
- Renderer must fall back all the way to a generated/simple generic marker even if image loading fails.
- Keep projected orientation vector authoritative and visible.

Tests:
- load success;
- failure -> fallback;
- repeated failure not repeatedly requested;
- cache reuse;
- cache cleanup/bound;
- token still draws if all image sources fail.

Manual smoke:
Render a Scene entirely with generic presets and simulate/delete one generic asset path to confirm graceful fallback.
```

## Prompt 24 — Add custom tactical artwork, view overrides, and safe mirroring

```text
You are implementing Prompt 24 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 24 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 25.

Goal: support ship-specific art while keeping the v1 schematic-orientation contract explicit.

Required work:
- Extend art config with:
  - one primary custom tactical icon;
  - optional per-view overrides for all nine fixed views;
  - artwork forward offset;
  - explicit North/South mirroring permission;
  - explicit East/West mirroring permission.
- Do not automatically mirror isometric artwork.
- Implement exact fallback order from the spec/contract.
- Apply forward offset to drawing only; never modify canonical heading.
- Ensure arbitrary heading/pitch is still communicated by the projected vector even if the artwork itself is approximate.
- Do not add video/animated-art support in this prompt.
- Keep paths as data; no executable injection.

Tests:
- every fallback level;
- view override beats primary icon;
- mirror only when opted in;
- no isometric mirror default;
- forward offset changes draw orientation but not state;
- broken custom override falls through cleanly.

Integration requirement:
Renderer must now obtain all tactical images through AssetManager; remove any direct image loading introduced earlier.
```

## Prompt 25 — Add Scene, placed Token, and Prototype Token configuration UI

```text
You are implementing Prompt 25 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 25 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 26.

Goal: make all essential module configuration available through normal Foundry UI.

Required work:
- Add a 3D Tactical Viewer section to Scene Configuration containing only the enable control and any concise eligibility/error text needed.
- If the Scene is unsupported, prevent/disable enablement and explain why.
- Add placed Token Configuration controls for:
  - Participate;
  - pitch;
  - generic art preset;
  - primary custom tactical icon;
  - advanced view-art configuration.
- Add equivalent default configuration to Prototype Token settings where Foundry's v14 sheet architecture supports it.
- Use Foundry File Picker for image selection.
- Advanced art editor supports the nine fixed view slots and mirroring/forward-reference options without overloading the normal token form.
- Writes must use the same flag access/persistence services used elsewhere.
- Do not alter the normal Foundry token image.

Tests:
- form/controller serialization;
- Scene flag writes;
- Token flag writes;
- prototype default writes;
- unsupported Scene enable prevention;
- File Picker result maps to expected field;
- invalid pitch handled.
- Existing runtime immediately reflects config updates through update hooks.

Manual Gate 5:
Configure an enabled Scene and two ship tokens entirely through UI, including one prototype-derived token and one custom-art token. Verify all declared views render.
```

## Prompt 26 — Harden Scene lifecycle, viewer reopen behavior, and external changes

```text
You are implementing Prompt 26 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 26 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 27.

Goal: make the integrated application survive normal Foundry lifecycle changes rather than only a single happy-path Scene session.

Required work:
- Handle viewed/active Scene changes cleanly.
- Save bounded user layout before leaving a Scene.
- Tear down viewer subscriptions/listeners/observers when closing or changing Scene.
- Re-evaluate Scene eligibility and enable flag on entry.
- Implement the chosen discoverable non-sidebar reopen mechanism.
- Respect the user's auto-open preference without reopening continuously after a manual close in the same Scene session.
- Handle token create/delete/participation changes.
- Handle external native/macro/module changes to:
  - x/y;
  - elevation;
  - rotation;
  - pitch flag;
  - art;
  - hidden/visibility;
  - dimensions.
- Handle a selected token being deleted or becoming invisible.
- Add a reconnect/refresh method that rebuilds computed state from current Documents, not stale caches.

Tests:
- Scene A -> Scene B -> Scene A;
- close/reopen;
- token delete while selected;
- participation toggle;
- visibility transition;
- external off-heading rotation;
- external off-step elevation;
- teardown leaves no duplicate subscribers.

Manual smoke:
Switch Scenes repeatedly with two clients and make external token edits through native Foundry while the viewer is open.
```

## Prompt 27 — Add accessibility, keyboard alternatives, and narrow-window behavior

```text
You are implementing Prompt 27 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 27 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 28.

Goal: ensure the tactical viewer is usable without precision dragging and remains operable in constrained application sizes.

Required work:
- Give every button/select/checkbox an accessible name.
- Add visible focus states.
- Add an accessible selected-token summary containing only currently visible/permitted information.
- Add keyboard/button alternatives for:
  - move one tactical cell on the two visible axes;
  - Z +/-1 in vertical views;
  - heading +/-45;
  - pitch next/previous.
- Keybindings must act only when viewer/panel focus is appropriate and must not intercept typing in editable controls.
- Respect permissions/locks for keyboard operations.
- Respect `prefers-reduced-motion`.
- Ensure 1–4 panel controls do not overflow catastrophically in narrow windows; provide sensible minimums/warnings and allow reducing panel count.
- Make overlap chooser keyboard usable.

Tests:
- tab/focus behavior;
- keyboard action calls same TacticalUpdateService path as pointer action;
- unauthorized keyboard action disabled/rejected;
- accessible labels do not reveal hidden tokens;
- narrow-width controller/layout state;
- reduced-motion class/state.

Manual accessibility check:
Operate selection, movement, heading, pitch, panel view choice, and overlap selection without dragging.
```

## Prompt 28 — Profile and harden rendering performance

```text
You are implementing Prompt 28 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 28 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 29.

Goal: optimize measured bottlenecks without changing architecture or behavior.

Required work:
- Add/finish static grid/background caching.
- Ensure repaint occurs only on invalidation, interaction, or resize; no idle continuous loop.
- Verify viewport culling before expensive image/label work.
- Batch hook bursts in one rAF.
- Ensure decoded-image cache is reused and bounded.
- Avoid allocating large arrays/objects for every token on every frame where practical.
- Add optional client-scoped DPR/performance limits only if profiling shows a need.
- Add lightweight debug instrumentation that is disabled by default and does not ship noisy console output.
- Profile the matrix in `test_strategy.md`: 10/1, 50/2, 50/4, 100/4.
- Document actual measurements and any chosen release target.

Tests:
- idle scheduler does not repaint;
- culling excludes offscreen tokens;
- one hook burst -> one render schedule;
- cache reuse;
- resize invalidates correctly;
- functional suite remains unchanged.

Do not replace Canvas2D with WebGL/Pixi unless measurements prove the current architecture cannot meet the target and the user explicitly approves that architecture change.
```

## Prompt 29 — Complete migration, recovery, reconnect, and interoperability hardening

```text
You are implementing Prompt 29 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 29 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, and any unresolved issue. Do not start Prompt 30.

Goal: turn the feature-complete build into a robust Foundry module that fails safely.

Required work:
- Finalize persistent schema migrations for Scene, Token, and user-layout data.
- Add fixtures for every supported historical schema created during development.
- Make migrations idempotent.
- Recover from corrupt one-Scene user layout without deleting other layouts.
- Recover from malformed tactical token flags with safe defaults.
- Handle image decode/path failure without repeated error spam.
- Handle Foundry rejecting or clamping a requested update; redraw accepted canonical state and notify the user when appropriate.
- Rebuild computed caches after reconnect/ready refresh.
- Audit source for direct `TokenDocument.update()` outside TacticalUpdateService.
- Audit source for Foundry private/internal APIs. Replace with public APIs; if one remains unavoidable, isolate and document it with a compatibility test.
- Test coexistence assumptions by performing native token movement/rotation/config changes while viewer is active.
- Remove temporary debug/test-only runtime pathways.

Tests:
- migration fixtures;
- corrupt flags/layout;
- update rejection/clamp;
- reconnect refresh;
- no stale subscribers;
- static/code-structure guard for write-path invariant where practical.

Manual reliability check:
Reload clients, reconnect, disable/re-enable module/Scene, and exercise normal Foundry token operations.
```

## Prompt 30 — Wire the release candidate, packaging, localization, and full acceptance

```text
You are implementing Prompt 30 of the 3D Tactical Viewer Foundry VTT v14 project.

Before changing code:
1. Read `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.
2. Read `implementation_contract.md`.
3. Read `test_strategy.md`.
4. Read `todo.md` and inspect the current repository state.
5. Run the complete existing automated test suite and record the baseline result.
6. Do not implement work assigned to later prompts.

Global rules:
- Target Foundry VTT v14.x and public/documented APIs.
- Production code uses native ES modules and has no third-party runtime dependency.
- Use test-driven development: add a test that fails for the intended reason before implementing the behavior.
- Keep pure math/model/projection code free of Foundry globals.
- Persist game state only through Foundry Documents/settings/flags as defined by the spec.
- Rendering and hooks must never write game state.
- Do not weaken existing tests to make this change pass.
- Do not add speculative or orphaned code; every production addition must be wired into the current runtime in this prompt.
- When the implementation is complete, run focused tests and then the full suite.
- Perform the prompt-specific manual Foundry smoke check if one is listed.
- Update only the Prompt 30 items in `todo.md` after all required tests pass.
- Finish by reporting changed files, tests run/results, manual checks, unresolved issues, and the final acceptance status. This is the final implementation prompt.

Goal: finish the project as an installable release candidate with no hanging code and prove the complete specification.

Required work:
- Audit the repository against `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`, `implementation_contract.md`, `test_strategy.md`, and every item in `todo.md`.
- Ensure all nine fixed views are user-selectable and functional.
- Ensure 1–4 panels and all three link toggles work.
- Ensure the runtime is composed through one clear entrypoint and there are no unused managers/controllers/services left over from development.
- Complete Foundry localization files and replace user-visible hard-coded strings where appropriate.
- Finalize `module.json` metadata, v14 compatibility, ES modules, styles, language files, and release URLs/placeholders as appropriate to the repository.
- Write/update README with:
  - install;
  - enable Scene;
  - configure tactical tokens;
  - 1–4 panels;
  - movement/orientation behavior;
  - custom art;
  - square-grid-only limitation;
  - isometric read-only movement limitation;
  - troubleshooting;
  - privacy/security behavior;
  - development/test commands.
- Add final manual test checklists under `tests/manual/`.
- Run the complete automated suite.
- Run the full Foundry manual acceptance matrix, including GM + player with different panel layouts and hidden-token tests.
- Build a release ZIP whose root contains the module contents in Foundry's expected form, and install that ZIP into a clean test environment.
- Verify the installed release has no third-party runtime dependency and no console errors.

Final architecture audit:
- one authoritative TokenDocument per object;
- no renderer/hook writes;
- no hidden information leak;
- correct settings scopes;
- square-grid coordinates proven;
- token position/heading/pitch sync across clients;
- no direct isometric movement;
- no permanent side-toolbar dependency;
- no map/camera rotation;
- no orphaned code.

Only after all acceptance checks pass, mark Prompt 30 and all remaining release items in `todo.md` complete.
```
