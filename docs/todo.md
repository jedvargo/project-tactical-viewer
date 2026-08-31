# 3D Tactical Viewer — Implementation TODO

Use this checklist together with `prompt_plan.md`.

A prompt may be marked complete only after its focused tests, full automated suite, and any specified Foundry smoke test pass.

## Status legend

```text
[ ] not started
[-] in progress
[x] complete and green
[!] blocked — document reason beneath item
```

---

## Foundation

### P00 — Repository/module/test scaffold
- [x] Create/validate `module.json`.
- [x] Add ES-module entrypoint.
- [x] Add development-only test tooling.
- [x] Add baseline unit/integration test folders.
- [x] Add fake Foundry test helper skeleton.
- [x] Prove module init can run without runtime dependency.
- [!] Run Foundry bootstrap smoke test.
  - Blocked: no linked or installed Foundry VTT v14 test environment was available for this workspace.

### P01 — Constants, view registry, runtime container
- [x] Add module ID/schema constants.
- [x] Add the exact nine-view registry.
- [x] Add heading/pitch allowed-value constants.
- [x] Create minimal runtime/service container.
- [x] Wire constants/runtime into entrypoint.
- [x] Test registry uniqueness and immutability expectations.

### P02 — Tactical math
- [x] Heading normalization/snapping.
- [x] Pitch normalization/snapping.
- [x] Foundry rotation <-> tactical heading conversion.
- [x] Orientation-vector calculation.
- [x] 3D Chebyshev distance.
- [x] 8x5 orientation truth-table tests.
- [x] Wire math through OrientationAdapter/runtime.

---

## Foundry state and coordinates

### P03 — Scene eligibility/settings
- [x] Register settings with correct world/user/client scopes.
- [x] Implement square-grid Scene eligibility.
- [x] Validate positive grid size/distance.
- [x] Add Scene tactical enable flag access.
- [x] Expose eligibility via runtime.
- [!] Real Foundry supported/unsupported Scene smoke tests.
  - Blocked: no linked or installed Foundry VTT v14 test environment was available for this workspace; the Foundry-shaped diagnostic smoke check passed.

### P04 — Token anchor and X/Y adapter
- [x] Implement tactical center/footprint anchor.
- [x] Use public square-grid APIs.
- [x] Handle Scene padding/offset.
- [x] Handle 1x1, 2x2, 3x2, 1x3 fixtures.
- [x] Convert tactical cell movement back to valid Token top-left.
- [!] Real Foundry coordinate Gate 1 partial test.
  - Blocked: no linked or installed Foundry VTT v14 test environment was available for this workspace; automated Foundry-shaped fixtures and diagnostic integration coverage passed.

### P05 — Elevation/Z adapter
- [x] Convert elevation <-> tactical Z.
- [x] Preserve negative elevation.
- [x] Detect off-step elevation.
- [x] Define user-initiated tactical Z snapping behavior.
- [x] Test multiple grid distances.
- [!] Complete real Foundry coordinate Gate 1.
  - Blocked: no linked or installed Foundry VTT v14 test environment was available for this workspace; no real-API discrepancy could be assessed.

---

## Projection/persistence/state

### P06 — Orthographic projection engine
- [x] Top projection.
- [x] North projection.
- [x] South projection.
- [x] East projection.
- [x] West projection.
- [x] Hidden-axis preservation.
- [x] Forward/inverse tests for interactive views.

### P07 — Isometric projection/depth math
- [x] NE/SE/SW/NW fixed cameras.
- [x] Project points and orientation vectors.
- [x] Deterministic depth keys.
- [x] Tie-break strategy.
- [x] Pure tests only; no isometric drag code.

### P08 — User/client persistence
- [x] Register user-scoped layout setting.
- [x] Register client-scoped rendering preferences.
- [x] Add layout schema/version.
- [x] Add migration.
- [x] Add bounded/LRU Scene-layout pruning.
- [x] Test scope correctness and corrupt entry fallback.

### P09 — Tactical token state
- [x] Participation flag access.
- [x] Pitch/art flag access.
- [x] Prototype-token defaults.
- [x] Placed-token runtime state builder.
- [x] Multi-cell width/height/depth exposure.
- [x] Runtime uses computed TacticalTokenState.

### P10 — Visibility/permission security service
- [x] Current-user visibility filter.
- [x] Permission/update capability.
- [x] Locked and rotation-lock handling.
- [x] No hidden metadata leaks.
- [x] Add security regression tests.
- [!] Real Foundry visibility Gate 2 partial test.
  - Blocked: no linked or installed Foundry VTT v14 test environment/world was available for the required GM/player hidden-token smoke check; automated Foundry-shaped security coverage passed.

### P11 — Tactical update service
- [x] Sole state-writing service.
- [x] Partial X/Y/elevation/rotation/pitch updates.
- [x] Pre-write permission checks.
- [x] Interaction-start field snapshots.
- [x] Same-field stale-edit cancellation.
- [x] Unrelated-field concurrent updates coexist.
- [x] No render/hook code writes.

### P12 — Hook/event coordinator
- [x] `moveToken` listener.
- [x] `updateToken` listener.
- [x] Create/delete token lifecycle events needed by viewer state.
- [x] Coalesce duplicate events with rAF scheduler.
- [x] Remove listeners on teardown.
- [x] Test no feedback loop.
- [!] Complete real Foundry security/write-path Gate 2.
  - Blocked: no linked or installed Foundry VTT v14 test environment/world was available for the required GM/player multi-client smoke check; automated Foundry-shaped synchronization, visibility, and write-path coverage passed.

---

## Viewer and orthographic MVP

### P13 — ApplicationV2 shell
- [ ] Create viewer ApplicationV2.
- [ ] One-panel layout.
- [ ] Basic open/close.
- [ ] Mount one Canvas2D surface.
- [ ] Connect runtime services.
- [ ] Resize observation.
- [ ] Viewer opens without continuous repaint.

### P14 — Top renderer
- [ ] Render tactical background/grid.
- [ ] Render only visible participating tokens.
- [ ] Correct token positions.
- [ ] Render selection/orientation placeholders.
- [ ] High-DPI backing store.
- [ ] Viewport culling baseline.
- [ ] First visible Top-view Foundry smoke test.

### P15 — Selection/pan/zoom
- [ ] Local tactical selection.
- [ ] Pointer hit testing.
- [ ] Pan.
- [ ] Zoom.
- [ ] Reset view.
- [ ] No native token `control()` side effect.
- [ ] Hidden tokens excluded from hit testing.

### P16 — Top movement + heading
- [ ] Local movement preview.
- [ ] Top drag changes X/Y only.
- [ ] Commit through TacticalUpdateService.
- [ ] Conflict cancellation.
- [ ] 45-degree heading editor.
- [ ] Respect movement/rotation locks.
- [ ] External native move/rotation redraw.
- [ ] Real Foundry XY edit smoke test.

### P17 — North X/Z movement + pitch
- [ ] North renderer using shared renderer/projection engine.
- [ ] North drag changes X/Z and preserves Y.
- [ ] Elevation update uses Scene grid distance.
- [ ] Pitch editor.
- [ ] Top/North stay synchronized.
- [ ] Multi-client XYZ smoke test.
- [ ] Gate 3 minimum useful 3D combat passed.

### P18 — South/East/West
- [ ] South rendering.
- [ ] East rendering.
- [ ] West rendering.
- [ ] Correct mirrored axes.
- [ ] X/Z and Y/Z drag semantics.
- [ ] Shared input path; no copy/paste divergence.
- [ ] Orthographic projection acceptance tests.

---

## Multi-panel viewer

### P19 — 1–4 panel layouts
- [ ] Panel count selector 1–4.
- [ ] Default layouts.
- [ ] Resizable splitters.
- [ ] Per-panel projection dropdown.
- [ ] Duplicate views allowed.
- [ ] Hidden panel configs retained.
- [ ] Persist user layout.

### P20 — Linked selection/center/zoom
- [ ] Link Selection.
- [ ] Link Center via shared 3D focus.
- [ ] Link Zoom via logical cell scale.
- [ ] Independent mode for each link.
- [ ] Hidden coordinate preserved while linked-panning.
- [ ] Two-user different-layout smoke test.
- [ ] Gate 4 passed.

---

## Isometric and artwork

### P21 — Isometric viewer
- [ ] Render NE.
- [ ] Render SE.
- [ ] Render SW.
- [ ] Render NW.
- [ ] Project authoritative heading/pitch vector.
- [ ] Selection/pan/zoom only.
- [ ] No direct isometric movement.

### P22 — Depth and overlapping tokens
- [ ] Deterministic isometric depth sort.
- [ ] Orthographic overlap detection.
- [ ] Visible-only stack count.
- [ ] Accessible stack chooser/cycler.
- [ ] Hidden-axis context.
- [ ] Selection remains visible.

### P23 — Generic tactical assets
- [ ] AssetManager.
- [ ] Generic ship/object/creature/marker.
- [ ] Lazy image loading.
- [ ] Broken-load memoization.
- [ ] Session cache bounds.
- [ ] Generic fallback always succeeds.

### P24 — Custom artwork
- [ ] Single custom tactical icon.
- [ ] Nine optional per-view overrides.
- [ ] Forward-reference metadata.
- [ ] Opt-in North/South mirroring.
- [ ] Opt-in East/West mirroring.
- [ ] No default isometric mirroring.
- [ ] Strict fallback-order tests.

### P25 — Scene/token configuration UI
- [ ] Scene enable control.
- [ ] Unsupported-grid validation message.
- [ ] Placed Token participation/pitch/art controls.
- [ ] Prototype Token defaults.
- [ ] File Picker integration for images.
- [ ] Advanced per-view art editor.
- [ ] Configuration writes use documented flags/settings.
- [ ] Gate 5 feature-complete smoke test.

---

## Hardening and release

### P26 — Lifecycle/external changes
- [ ] Scene switch handling.
- [ ] viewer close/reopen.
- [ ] token create/delete.
- [ ] participation toggles.
- [ ] visibility transitions.
- [ ] external rotation/elevation/macro updates.
- [ ] listener teardown.
- [ ] reconnect refresh path.

### P27 — Accessibility/responsive/keyboards
- [ ] Accessible controls/labels.
- [ ] keyboard alternatives for movement/orientation.
- [ ] focus-scoped shortcuts.
- [ ] reduced motion.
- [ ] selected-token accessible summary.
- [ ] narrow-window behavior.
- [ ] 1–4 panel controls remain usable.

### P28 — Performance
- [ ] Static grid/background caching.
- [ ] culling.
- [ ] rAF batching verified.
- [ ] decoded-image cache.
- [ ] no idle render loop.
- [ ] 10/50/100-token profiling.
- [ ] document measurements.
- [ ] optimize only measured hotspots.

### P29 — Reliability/interoperability
- [ ] schema migration fixtures.
- [ ] corrupt-data recovery.
- [ ] missing art recovery.
- [ ] Foundry rejection/clamping handling.
- [ ] stale layout cleanup.
- [ ] module coexistence checks.
- [ ] no private API dependency without documented justification.
- [ ] reconnect/multi-user regression suite.

### P30 — Release candidate
- [ ] Complete localization keys.
- [ ] Complete `module.json` metadata/compatibility.
- [ ] README install/use/limitations.
- [ ] manual Foundry smoke checklist complete.
- [ ] multi-client checklist complete.
- [ ] full spec acceptance matrix complete.
- [ ] no runtime dependencies.
- [ ] no debug output/test hooks in production path.
- [ ] package/install smoke test from release ZIP.
- [ ] Gate 6 passed.

---

## Deferred post-v1 work — do not implement in prompts 00–30

- [ ] Isometric direct movement.
- [ ] 3D models.
- [ ] arbitrary/free camera.
- [ ] map rotation.
- [ ] hex/gridless cubic adapters.
- [ ] speed/acceleration/maneuverability rules.
- [ ] weapon arcs.
- [ ] firing solutions/range rings.
- [ ] collision volumes.
- [ ] multi-cube occupancy rules.
- [ ] ship-sheet integrations.
- [ ] external module integrations.
