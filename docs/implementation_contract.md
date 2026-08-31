# 3D Tactical Viewer — Implementation Contract

**Purpose:** This file defines non-negotiable implementation constraints for code-generation agents working from `3D_Tactical_Viewer_Functional_Technical_Spec_v2.md`.

The specification is the product source of truth. This contract exists to prevent implementation drift between prompts.

## 1. Platform and dependency rules

- Target Foundry VTT v14.x.
- Use modern ES modules loaded through `module.json`.
- Use `ApplicationV2` for the Tactical Viewer application.
- Use one to four HTML `<canvas>` render surfaces inside that application.
- Prefer Canvas2D for the v1 renderer.
- Do not create additional Foundry Scenes or full Foundry Canvas instances for projections.
- Do not require any other Foundry module.
- Production/runtime code must have no third-party JavaScript runtime dependency unless a later approved design change explicitly adds one.
- Development-only test dependencies are allowed.
- Foundry-version-specific calls must be isolated behind adapters/services rather than scattered through projection and rendering code.

## 2. Authoritative-state rules

There is one authoritative Foundry `TokenDocument` per tactical object.

Persisted shared state comes only from:

- `TokenDocument.x`
- `TokenDocument.y`
- `TokenDocument.elevation`
- `TokenDocument.rotation`
- namespaced `TokenDocument` flags, including pitch and tactical-art configuration
- the Scene's namespaced enable flag

Do not create or persist a second X/Y/Z/heading state.

Viewer objects may cache computed tactical state for rendering, but caches are disposable and never authoritative.

## 3. Update-flow invariant

All gameplay writes must follow:

```text
explicit user/API action
  -> validate visibility/permission/conflict
  -> construct partial Document update
  -> TokenDocument.update(...)
  -> Foundry processes and synchronizes
  -> moveToken/updateToken event coordinator
  -> invalidate affected viewports
  -> render from current Document state
```

Rendering, hook handling, projection, and cache refresh code must never call `TokenDocument.update()` as a side effect.

No panel writes directly to another panel.

## 4. Scene/grid rules

Interactive v1 support is square-grid only.

Do not silently adapt:

- hex scenes;
- gridless scenes;
- invalid/zero grid distance;
- invalid grid dimensions.

Unsupported scenes must fail clearly and safely.

Do not compute tactical X/Y with `Math.round(token.x / gridSize)` or similar raw arithmetic.

Foundry token X/Y are top-left pixel coordinates. Tactical position uses a center/footprint anchor and Foundry square-grid APIs.

## 5. Coordinate convention

Canonical tactical axes:

```text
+X = East
+Y = South
+Z = Up
North = -Y
```

Heading:

```text
000 N
045 NE
090 E
135 SE
180 S
225 SW
270 W
315 NW
```

Pitch:

```text
+90 straight up
+45 climb
0 level
-45 dive
-90 straight down
```

Cubic tactical distance:

```text
max(abs(dx), abs(dy), abs(dz))
```

Movement and orientation remain separate in v1. Do not enforce speed, turn radius, facing movement, acceleration, or maneuverability rules.

## 6. Rotation rules

Foundry native token rotation is the persisted heading source.

The tactical heading convention is converted through exactly one `OrientationAdapter`.

Do not persist an additional heading flag.

Do not silently rewrite arbitrary external rotations from render/update hooks. Tactical Viewer edits snap to the eight approved headings; external rotations may display as off-heading until explicitly edited.

Respect both token locking and rotation-lock behavior.

## 7. Elevation rules

Foundry elevation is authoritative.

For a Scene with grid distance `D`:

```text
tacticalZ = elevation / D
```

A tactical vertical step changes elevation by exactly `D`.

Off-step external elevation is displayed, not silently corrected by rendering or hooks.

## 8. Visibility and security rules

This is release-blocking.

A user must never see a token or token metadata in Tactical Viewer that Foundry does not expose to that user.

Visibility filtering applies to:

- token sprites;
- names;
- labels;
- stack counts;
- hit testing;
- tooltips;
- accessibility text;
- selection;
- movement previews.

Use current-user Foundry visibility as the authority. GM behavior may differ only through explicit GM-safe behavior.

## 9. Permission and concurrency rules

Before a write:

- verify current user can update the TokenDocument;
- respect locked/movement/rotation restrictions;
- compare fields captured at interaction start with the current document if the interaction could have become stale.

If another user changed the same fields during a local drag/edit, cancel the stale local commit rather than silently overwriting it.

Use partial updates so unrelated concurrent changes can coexist.

## 10. Panel/UI rules

Each user chooses 1–4 panels.

Each panel independently chooses:

- Top
- North
- South
- East
- West
- Isometric NE
- Isometric SE
- Isometric SW
- Isometric NW

User-local link options:

- Link Selection
- Link Center
- Link Zoom

There is no link-token-rotation option because token orientation is shared game state.

No map/camera rotation exists in v1.

Isometric views are view/select/pan/zoom only in v1; no direct 3D dragging.

## 11. Persistence scopes

Use:

- Scene flags for shared Scene enablement.
- Token/prototype-token flags for shared tactical configuration.
- `scope: "user"` settings for user layout preferences that should follow that Foundry user.
- `scope: "client"` only for browser/device rendering preferences.
- `scope: "world"` only for true GM/world defaults.

Per-Scene user layout storage must be bounded and migrated explicitly.

Do not persist an unbounded history of transient pan/zoom state.

## 12. Rendering rules

Canvas2D is the MVP renderer.

Required renderer properties:

- no continuous animation loop while idle;
- `requestAnimationFrame` invalidation batching;
- static grid/background caching where useful;
- viewport culling;
- decoded-image caching;
- high-DPI backing-store handling;
- resize observation;
- no DOM element per grid square.

Canvas2D is behind an interface so a later renderer can be substituted without rewriting game-state logic.

## 13. Artwork rules

Generic tactical art must always provide a fallback.

Custom art is schematic identity art, not the authority for heading/pitch.

The projected orientation vector is authoritative.

Do not require hundreds of sprite frames.

Do not assume custom art is safe to mirror.

Broken/missing art falls back; it never removes the token from the tactical view.

## 14. Selection rules

Tactical Viewer selection is local viewer state in v1.

Do not automatically call Foundry native token `control()` simply because the tactical token is selected. Native control can affect vision and module interoperability.

## 15. Testing rule

Every implementation prompt is test-driven:

1. Run the existing suite before changing code.
2. Add or update tests that fail for the intended reason.
3. Implement the smallest production change needed.
4. Wire it into the current runtime; no orphaned code.
5. Run focused tests.
6. Run the complete automated suite.
7. Perform any prompt-specific Foundry/manual smoke check.
8. Update `todo.md` only after the step is green.

Do not weaken or delete a valid existing test merely to make a new change pass.

## 16. Scope-control rule

Each prompt implements only its stated scope.

Do not anticipate later prompts by adding speculative:

- weapon arcs;
- ship speed rules;
- combat-system integration;
- 3D models;
- isometric drag movement;
- map rotation;
- extra projections;
- external module dependencies.

When a later feature needs a seam, create the smallest seam required now and test it.

## 17. Current authoritative Foundry references

- Module development: https://foundryvtt.com/article/module-development/
- ApplicationV2: https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html
- ClientSettings scopes: https://foundryvtt.com/api/classes/foundry.helpers.ClientSettings.html
- TokenDocument: https://foundryvtt.com/api/classes/foundry.documents.TokenDocument.html
- TokenData: https://foundryvtt.com/api/interfaces/foundry.documents.types.TokenData.html
- TokenPosition: https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.TokenPosition.html
- SquareGrid: https://foundryvtt.com/api/classes/foundry.grid.SquareGrid.html
- `moveToken`: https://foundryvtt.com/api/v14/functions/hookEvents.moveToken.html
- update Document hooks: https://foundryvtt.com/api/v14/functions/hookEvents.updateDocument.html

If an implementation detail conflicts with current official Foundry v14 documentation, stop and document the conflict before inventing a workaround.
