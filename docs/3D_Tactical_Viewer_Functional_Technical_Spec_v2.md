# 3D Tactical Viewer for Foundry VTT
## Functional and Technical Specification v2

**Working module ID:** `tactical-3d-viewer`  
**Target platform:** Foundry Virtual Tabletop v14.x  
**Document status:** Revised after critical design review / deep research  
**Primary use case:** System-agnostic three-dimensional tactical combat using synchronized 2D projections of a cubic battlespace  
**Initial game use case:** Spelljammer-style ship combat

---

## 1. Purpose

3D Tactical Viewer is a Foundry VTT module that allows users to understand and manipulate three-dimensional token positions without operating a conventional free-camera 3D environment.

The module represents one authoritative Foundry Scene and one authoritative TokenDocument per participating object. It renders that shared state into one to four synchronized tactical panels selected independently by each user.

A participating tactical token has the canonical state:

- X position
- Y position
- Z/elevation
- heading
- pitch

The module projects that state into fixed tactical views:

- Top
- North
- South
- East
- West
- Isometric NE
- Isometric SE
- Isometric SW
- Isometric NW

The core goal is to make a 3D battle readable as synchronized tactical plotting boards rather than requiring users to navigate a 3D camera.

---

## 2. Revision Summary

Version 2 incorporates the findings of the critical analysis report and makes the following major changes to the original specification.

### 2.1 Square-grid requirement for v1

Version 1 supports authoritative tactical movement only on Foundry square-grid Scenes.

Hex and gridless Scenes are not supported for cubic tactical movement in v1. The module shall prevent Scene enablement, or open in a clearly labeled read-only unsupported state, rather than silently applying incorrect coordinate math.

### 2.2 Canonical position no longer divides raw Token x/y by grid size

Foundry TokenDocument `x` and `y` represent the token's top-left position in pixels, not the tactical center of the object.

The module shall use a dedicated coordinate adapter based on Foundry grid APIs and a token tactical anchor derived from the token center/footprint.

### 2.3 Elevation conversion is explicit

Foundry elevation uses Scene distance units. Tactical Z uses grid levels.

For a square-grid Scene:

`tacticalZ = token.elevation / scene.grid.distance`

Interactive Tactical Viewer moves increment elevation by exactly one Scene grid distance per Z level.

Externally supplied off-step elevations are displayed rather than silently destroyed, but are marked off-grid until the user performs a tactical snap/move.

### 2.4 User and client settings are separated correctly

Foundry v14 distinguishes world, user, and client settings.

- User-scoped settings store player preferences such as panel count and panel views.
- Client-scoped settings store machine/browser-specific rendering preferences.
- Scene flags store shared Scene enablement.
- Token/prototype-token flags store shared tactical token configuration.

### 2.5 Visibility and fog-of-war are now security requirements

Because the Tactical Viewer is a custom renderer, it must not reveal tokens that Foundry would hide from the current user.

The viewer shall respect the calling user's Foundry token visibility state. Hidden or vision-obscured tokens may not be exposed to players merely because they participate in Tactical Viewer.

### 2.6 Synchronization is one-way through Foundry Documents

Panels never synchronize directly with one another.

The write flow is:

`user input -> TokenDocument update -> Foundry synchronization -> viewer invalidation -> redraw`

Rendering and update hooks must never write canonical state back to the document.

### 2.7 Movement hooks are de-duplicated

Position updates and orientation/flag updates can trigger overlapping Foundry hooks.

The module shall use an event coordinator and coalesce repaint work into the next animation frame.

`moveToken` is used for finalized movement events.

`updateToken` handles non-movement changes such as rotation and module flags and shall not cause duplicate movement redraw work.

### 2.8 Custom sprite artwork is explicitly schematic

A fixed set of nine 2D images cannot visually encode every combination of:

- eight headings;
- five pitches;
- nine camera projections.

Therefore v1 does not claim physically exact sprite orientation.

The projected heading/pitch vector is authoritative. Custom per-view artwork is identity/appearance artwork and may be approximate.

### 2.9 Isometric movement remains disabled in v1

Isometric panels are view/select/pan/zoom surfaces in the MVP. Direct isometric dragging is deferred until an unambiguous 3D cell-selection interaction is designed.

### 2.10 Viewer persistence is bounded

Persistent per-user state stores layout preferences, not unbounded transient camera history.

Pan/zoom/center are session state by default. Per-Scene persistent layout entries are bounded and stale entries are pruned.

---

# 3. Design Principles

The implementation shall follow these principles.

1. One Foundry Scene is authoritative.
2. One TokenDocument per participating object is authoritative.
3. No duplicate Scene is created for side or isometric views.
4. Panels are projections, not independent maps.
5. Shared token position and orientation always synchronize.
6. User interface layout remains local to each user.
7. Foundry permissions and visibility remain authoritative.
8. Foundry public APIs are preferred over protected/private APIs.
9. Rendering must never mutate game state.
10. Custom rendering must not reveal information hidden by Foundry.
11. Cubic tactical movement is discrete and intentionally game-like rather than physically exact.
12. The module is system-agnostic.
13. No external module is required.
14. No gameplay mode selector exists.
15. Panel count is user configurable from 1 through 4.
16. No free camera rotation is required.
17. No Scene/map rotation is required.
18. Isometric views remain fixed projections in v1.

---

# 4. Foundry Platform Baseline

The implementation target is Foundry VTT v14.x.

The module shall use modern Foundry APIs, including:

- `ApplicationV2`;
- `TokenDocument`;
- `Scene`;
- Foundry Document flags;
- Foundry game settings;
- square-grid APIs;
- token visibility APIs;
- `moveToken`;
- `updateToken`;
- standard Document `update()` calls;
- ES modules through the package manifest.

The final `module.json` shall declare explicit Foundry compatibility using the `compatibility.minimum`, `compatibility.verified`, and, if appropriate, `compatibility.maximum` fields.

The module must not rely on undocumented internals unless a documented API is genuinely insufficient and the use is isolated behind a compatibility adapter.

---

# 5. Supported Scene Requirements

## 5.1 Square grid

Version 1 interactive Tactical Viewer requires:

- active Scene;
- square grid;
- positive grid pixel size;
- positive grid distance;
- valid Scene dimensions.

Scene enablement shall validate these requirements.

If the Scene is gridless or hexagonal:

- the GM receives a clear explanation;
- the module does not pretend that cubic movement is valid;
- interactive Tactical Viewer movement is disabled.

A future release may add explicit alternative coordinate adapters.

## 5.2 Grid diagonal rules

Foundry/system diagonal-distance rules do not change Tactical Viewer cubic distance in v1.

Tactical Viewer uses its own 3D cubic movement metric.

## 5.3 Scene bounds

X/Y movement remains within valid Scene/canvas bounds according to Foundry update validation and module-side preview validation.

Z has no module-defined absolute ceiling or floor in v1.

If Foundry core, a Level, a Region, or another rule clamps/rejects an elevation update, the module accepts Foundry's resulting canonical state.

---

# 6. Scene Enablement

Scene Configuration shall provide:

```text
3D Tactical Viewer

[ ] Enable 3D Tactical Viewer for this Scene
```

There is no Space/Air/Underwater/Combat mode.

Scene state is conceptually:

```text
flags.tactical-3d-viewer = {
  schemaVersion: 2,
  enabled: true
}
```

Only users with authority to update the Scene may change this setting.

When a Scene is disabled:

- Tactical Viewer does not auto-open;
- tactical token flags remain intact;
- no token data is deleted;
- users may continue using Foundry normally.

If an enabled Scene becomes disabled while a viewer is open, the viewer closes or enters a disabled state without modifying token data.

---

# 7. Viewer Opening and Closing

When an enabled Scene becomes the viewed/active Scene, Tactical Viewer may auto-open according to the user's preference.

The module shall not require a permanent Foundry left-side toolbar button.

The viewer must nevertheless have at least one discoverable method to reopen it after closing. Acceptable implementations include:

- a Scene context action;
- a module settings/menu action;
- an application launcher entry;
- a configurable keybinding.

The exact launcher surface is an implementation decision and shall be selected to minimize interference with Foundry core UI.

Closing the viewer:

- does not disable the Scene;
- does not modify tokens;
- does not affect other users;
- stops viewer-only render work;
- preserves persistent user layout settings.

---

# 8. Canonical Tactical Coordinate System

The tactical world coordinate system is:

```text
+X = East / right on Top view
+Y = South / down on Top view
+Z = Up
```

Therefore:

```text
North = -Y
South = +Y
East  = +X
West  = -X
```

Heading 000 points North.

The coordinate system shall be defined once in a `CoordinateAdapter` and used by all projection, movement, orientation, and distance calculations.

---

# 9. Token Tactical Anchor

Foundry TokenDocument `x` and `y` are top-left pixel coordinates.

Tactical Viewer shall not treat raw `x/y` as the ship center.

The module defines a tactical anchor at the center of the token's current 2D footprint.

For a square grid:

```text
centerX = token.x + token.width  * grid.sizeX / 2
centerY = token.y + token.height * grid.sizeY / 2
```

Where possible, the implementation may use the public PlaceableObject center accessor when the token object exists.

The coordinate adapter shall use Foundry grid APIs to translate between:

- canvas pixel positions;
- grid offsets;
- snapped points;
- tactical panel coordinates.

It shall not assume the grid begins at pixel 0,0.

This avoids errors caused by:

- Scene padding;
- Scene offsets;
- multi-cell token footprints;
- future changes in Foundry grid implementation.

---

# 10. Tactical X/Y Representation

Canonical shared game state remains Foundry's TokenDocument position.

Tactical Viewer derives tactical X/Y grid coordinates from the token anchor.

The module may expose human-readable grid coordinates such as:

```text
X 12
Y 8
```

or scene-style labels such as:

```text
H12
```

but those are derived values and are not separately persisted.

For multi-cell tokens whose geometric center lies between cell centers, the internal coordinate representation may contain half-grid values.

Movement deltas remain integer grid steps.

---

# 11. Tactical Z and Elevation

Foundry elevation is authoritative.

For a Scene whose grid distance is `D`:

```text
tacticalZ = elevation / D
```

Interactive tactical vertical movement of one cell changes elevation by:

```text
+/- D
```

Example:

```text
grid distance = 5 ft
elevation = 15 ft
tactical Z = +3
```

## 11.1 Off-grid elevation

If an external module, macro, or user sets elevation to a value not divisible by the grid distance:

- the viewer renders the true elevation;
- the token receives an optional visual `OFF GRID` indicator;
- the module does not silently rewrite the value from a render/update hook;
- the next user-initiated tactical move may snap the starting or destination Z according to documented behavior.

## 11.2 Zero and negative elevation

Z 0 is the Scene's normal elevation plane.

Negative elevation is supported.

---

# 12. Heading

Heading is the ship's horizontal facing.

Allowed tactical headings:

| Heading | Direction |
|---:|---|
| 000° | North |
| 045° | Northeast |
| 090° | East |
| 135° | Southeast |
| 180° | South |
| 225° | Southwest |
| 270° | West |
| 315° | Northwest |

Tactical Viewer editing always snaps heading to these values.

Foundry token rotation remains the persisted heading source.

The module does not persist a second heading field.

---

# 13. Foundry Rotation Adapter

Foundry's token rotation convention differs from the Tactical Viewer heading convention.

The module shall isolate all conversion in an `OrientationAdapter`.

The adapter shall have explicit automated tests for at least:

```text
Foundry rotation 0   <-> Tactical South / 180
Foundry rotation 90  <-> Tactical West / 270
Foundry rotation 180 <-> Tactical North / 000
Foundry rotation 270 <-> Tactical East / 090
```

If implementation testing against Foundry v14 shows a different positive-rotation direction, the adapter is corrected without changing tactical heading semantics elsewhere.

Artwork orientation offset shall not alter the real heading.

---

# 14. Pitch

Pitch is stored as a module-owned TokenDocument flag.

Allowed values:

| Pitch | Meaning |
|---:|---|
| +90° | Straight up |
| +45° | Climbing |
| 0° | Level |
| -45° | Diving |
| -90° | Straight down |

Conceptual persistence:

```text
flags.tactical-3d-viewer.pitch = 45
```

Heading is retained when pitch reaches +/-90 degrees.

Invalid stored pitch is normalized for display to the nearest supported value, but normalization is not silently persisted from a render hook.

A user-authorized edit may persist the corrected value.

---

# 15. Canonical Tactical Token State

A placed tactical token's effective state is:

```text
TacticalTokenState
{
  tokenId
  sceneId

  centerX
  centerY
  elevation

  tacticalX
  tacticalY
  tacticalZ

  heading
  pitch

  width
  height
  depth

  visibleToCurrentUser
  canCurrentUserUpdate
}
```

Only Foundry Documents and module flags are persisted.

The state object is a computed client-side view model.

---

# 16. Token Participation

A token or prototype token may define:

```text
3D Tactical Viewer

[ ] Participate in 3D Tactical Viewer
```

Conceptual flag:

```text
flags.tactical-3d-viewer.enabled = true
```

Non-participating tokens are ignored by Tactical Viewer.

Participating tokens remain ordinary Foundry tokens.

---

# 17. Prototype Tokens and Placed Tokens

The module shall explicitly support Foundry prototype-token behavior.

## 17.1 Prototype token configuration

Prototype tokens may define defaults for:

- Tactical Viewer participation;
- tactical art preset;
- custom tactical art references;
- mirroring policy;
- artwork forward offset;
- default pitch.

These defaults are copied when a placed token is created according to normal Foundry prototype-token behavior.

## 17.2 Placed token state

Placed tokens own runtime state:

- x;
- y;
- elevation;
- rotation/heading;
- pitch.

Prototype elevation is not used as tactical position.

## 17.3 Existing tokens

Changing a prototype token later shall not be assumed to retroactively modify already placed tokens.

Bulk application of changed tactical defaults to existing tokens may be added as a separate explicit tool later.

---

# 18. Multi-Cell Tokens

Version 1 shall permit participating tokens larger than 1x1, but with limited semantics.

The token tactical anchor is its center.

The Top view may render its width/height footprint.

Vertical/isometric panels may use Foundry `depth` where available as an optional visual extent.

Version 1 does not provide:

- 3D collision-volume enforcement;
- multi-cube occupancy attacks;
- swept-volume collision;
- automatic boarding-contact geometry.

A token's size is visual/contextual in v1; movement remains based on its anchor.

This limitation must be documented.

---

# 19. Fixed View List

Every panel selects exactly one of these v1 views:

| View ID | Display name | Projection |
|---|---|---|
| `top` | Top | XY |
| `north` | North | XZ |
| `south` | South | XZ |
| `east` | East | YZ |
| `west` | West | YZ |
| `iso-ne` | Isometric NE | XYZ |
| `iso-se` | Isometric SE | XYZ |
| `iso-sw` | Isometric SW | XYZ |
| `iso-nw` | Isometric NW | XYZ |

The names North/South/East/West identify the camera side of the battlefield.

The viewer shall show small axis labels so users do not have to remember projection mirroring.

---

# 20. Orthographic Projection Semantics

All orthographic panels use +Z as screen-up.

## 20.1 Top

Top looks downward from +Z.

```text
screen horizontal = +X east
screen vertical   = -Y north
hidden axis       = Z
```

Top displays:

- X/Y position;
- heading;
- optional Z/elevation label;
- optional pitch indicator.

## 20.2 North

North camera is positioned north of the battlefield looking south.

```text
visible axes = X/Z
hidden axis  = Y
screen up    = +Z
```

The screen horizontal axis shall be labeled explicitly to avoid left/right ambiguity.

## 20.3 South

South is the opposing X/Z projection.

## 20.4 East

East camera is positioned east of the battlefield looking west.

```text
visible axes = Y/Z
hidden axis  = X
screen up    = +Z
```

## 20.5 West

West is the opposing Y/Z projection.

The exact projection matrices shall live in the projection engine and have automated inverse/round-trip tests.

---

# 21. Isometric Views

The four isometric projections are fixed.

`Isometric NE` means the virtual camera is above and northeast of the battlefield, looking toward the tactical center.

Equivalent definitions apply to SE, SW, and NW.

Isometric panels support:

- viewing;
- selection;
- pan;
- zoom;
- linked center;
- linked zoom;
- names/labels;
- heading/pitch vector;
- movement preview rendering when initiated elsewhere.

Version 1 does not support direct token dragging from an isometric panel.

No free orbit/camera yaw/pitch exists.

---

# 22. Panel Count

Each user independently chooses:

```text
1
2
3
4
```

panels.

Panel count is not Scene-wide shared state.

Examples:

```text
GM       = 4 panels
Player A = 2 panels
Player B = 1 panel
Player C = 3 panels
```

They all observe the same authoritative Scene/token state.

---

# 23. Default Layouts

## 23.1 One panel

```text
+-----------------------------+
|           Panel 1           |
+-----------------------------+
```

## 23.2 Two panels

```text
+---------------+-------------+
|    Panel 1    |   Panel 2   |
+---------------+-------------+
```

## 23.3 Three panels

```text
+-------------------+---------+
|                   | Panel 2 |
|      Panel 1      +---------+
|                   | Panel 3 |
+-------------------+---------+
```

## 23.4 Four panels

```text
+---------------+-------------+
|    Panel 1    |   Panel 2   |
+---------------+-------------+
|    Panel 3    |   Panel 4   |
+---------------+-------------+
```

Splitters are resizable.

Hidden panel configurations should be retained when the user temporarily reduces the panel count.

---

# 24. Panel Controls

Each panel shall have a compact overlay toolbar.

Minimum:

```text
[ Top v ]    [-] 125% [+]    [Options]
```

Each panel supports:

- view dropdown;
- zoom;
- pan;
- overlay options;
- reset view.

Panel dropdown changes do not modify game state.

Duplicate projections are permitted.

---

# 25. Shared Viewer Controls

Viewer-wide link controls:

```text
[x] Link Selection
[x] Link Center
[x] Link Zoom
```

There is no "Link Token Rotation" setting.

Token position, heading, and pitch are canonical game state and always synchronize.

---

# 26. Linked Selection

Selection linking is user-local.

When enabled, selecting a tactical token in one panel highlights the same token in all open panels for that user.

Viewer selection does not automatically take Foundry core control of the native token in v1.

This avoids interfering with:

- other modules;
- core token-control behavior;
- vision changes caused by controlling a token;
- group selection.

A future opt-in native-selection bridge may be added separately.

---

# 27. Linked Center

When enabled, panels share one logical 3D focus point:

```text
focus = { x, y, z }
```

Panning an orthographic panel changes only the axes visible in that panel while preserving the hidden coordinate.

Examples:

Top pan:

```text
change X/Y
preserve Z
```

North/South pan:

```text
change X/Z
preserve Y
```

East/West pan:

```text
change Y/Z
preserve X
```

Other linked panels re-project the new focus point.

When disabled, each panel stores an independent focus point for the current session.

---

# 28. Linked Zoom

Linked Zoom synchronizes logical tactical scale, not raw browser zoom.

A common scale is defined as:

```text
pixels per tactical grid cell
```

Orthographic panels use the same cell scale.

Isometric panels derive the equivalent projected cube-edge scale.

High-DPI backing-store scaling is separate from logical tactical zoom and must not alter the linked-zoom value.

---

# 29. Persistent User Layout

Foundry v14 user-scoped settings shall hold user preferences that should follow the player.

Persistent per-Scene user state includes:

- panel count;
- selected view for panels 1-4;
- panel splitter proportions;
- Link Selection;
- Link Center;
- Link Zoom;
- overlay visibility choices.

Pan/zoom/center are session state by default and are not persisted indefinitely in v1.

The per-Scene layout map shall be bounded.

Recommended behavior:

- retain the most recently used 25-50 Scene layouts;
- remove entries for old Scenes using LRU pruning;
- migrate old layout schemas explicitly.

Client-scoped settings are reserved for browser/device-specific values such as:

- rendering quality;
- maximum device-pixel-ratio;
- debug renderer overlays;
- reduced-animation/performance options.

World-scoped settings are reserved for GM-controlled defaults that truly apply to the whole World.

---

# 30. Changing Panel Count During Play

Panel count can change without Scene reload.

Example:

```text
3 -> 4
```

Panels 1-3 retain their configuration.

Panel 4 restores its previous hidden configuration or receives a default view if none exists.

Example:

```text
4 -> 2
```

Panels 3-4 are hidden, not destroyed from the user's saved layout.

Other users are unaffected.

---

# 31. Token Movement from Top

Dragging from Top updates X/Y only.

Z/elevation is preserved.

Flow:

```text
pointer drag
 -> local preview
 -> grid snap/validation
 -> permission check
 -> TokenDocument.update({x, y})
 -> Foundry update
 -> viewer invalidation
 -> redraw all relevant panels
```

The movement must preserve token footprint and tactical anchor correctly.

The coordinate adapter shall use Foundry square-grid snapping rather than hand-rolled `Math.round(x / gridSize)` logic.

---

# 32. Token Movement from North/South

North/South drag changes:

- X;
- elevation/Z.

Y is preserved.

The module converts the requested tactical Z into Foundry elevation:

```text
newElevation = newZ * scene.grid.distance
```

and performs one partial document update.

---

# 33. Token Movement from East/West

East/West drag changes:

- Y;
- elevation/Z.

X is preserved.

---

# 34. Movement Preview

Dragging uses an optimistic local preview.

The preview shall display, when space permits:

```text
Delta X
Delta Y
Delta Z
tactical distance
candidate destination
```

Example:

```text
DX +1
DY -1
DZ +1
Distance 1 cube
```

No game-state write occurs until drop/commit.

If Foundry rejects the update:

- preview is discarded;
- token returns to authoritative state;
- a concise error is shown.

---

# 35. Cubic Movement Metric

Version 1 uses a 26-neighbor cubic grid.

Adjacent positions include:

- 8 same-level neighbors;
- 9 neighbors above;
- 9 neighbors below.

Tactical distance:

```text
distance = max(abs(DX), abs(DY), abs(DZ))
```

This is Chebyshev distance in three dimensions.

The module does not apply Euclidean square-root distance in v1.

The distance algorithm must be isolated behind an interface so alternative rule systems can replace it later.

---

# 36. Movement vs Orientation

Version 1 does not enforce that a ship may move only in the direction it faces.

Heading/pitch describe orientation.

Movement is an independent tactical position edit.

Rules such as:

- current speed;
- turn radius;
- maneuverability class;
- acceleration;
- minimum forward movement;

belong to later rule/integration layers.

This separation keeps the core viewer system-agnostic.

---

# 37. Heading Editing

Top view is the primary heading editor.

Selected editable tokens shall expose a discrete heading control.

Allowed changes are 45-degree increments.

On commit:

```text
tactical heading
 -> OrientationAdapter
 -> Foundry rotation
 -> TokenDocument.update({rotation})
```

The viewer must respect:

- Token ownership;
- `locked`;
- `lockRotation`.

If rotation is locked, Tactical Viewer shall not silently bypass it.

---

# 38. Pitch Editing

North/South/East/West panels can edit pitch.

Pitch controls are discrete:

```text
+90
+45
0
-45
-90
```

On commit:

```text
TokenDocument.update({
  "flags.tactical-3d-viewer.pitch": value
})
```

The renderer updates only after the canonical document update is accepted.

---

# 39. Orientation Vector

The physically meaningful orientation indicator is a projected 3D vector.

For tactical heading `h` and pitch `p`:

```text
dx = sin(h) * cos(p)
dy = -cos(h) * cos(p)
dz = sin(p)
```

The vector is projected through the same projection matrix as the token.

This vector is authoritative for orientation display in every panel.

The module must not rely on custom sprite artwork alone to communicate direction.

---

# 40. Artwork Model

The v1 artwork system distinguishes identity artwork from orientation state.

## 40.1 Generic tactical icon

Every participating token has a guaranteed generic tactical representation.

Built-in presets should include at minimum:

- generic ship;
- generic object;
- generic creature;
- generic marker.

Additional presets may include:

- sailing ship;
- galleon;
- small vessel;
- large vessel;
- living vessel;
- asteroid.

## 40.2 Custom tactical icon

A user may assign a single custom tactical icon intended as the primary identity representation.

This is the simplest and recommended custom-art workflow.

## 40.3 Optional per-view artwork

Advanced users may additionally assign artwork for the nine fixed views:

```text
Top
North
South
East
West
Isometric NE
Isometric SE
Isometric SW
Isometric NW
```

These images are not treated as complete orientation frames.

The projected orientation vector remains visible and authoritative.

---

# 41. Important Sprite Limitation

Nine view images cannot exactly depict all possible ship orientations.

A ship can have:

```text
8 headings * 5 pitches = 40 orientations
```

for each camera projection.

Requiring a complete physically exact raster set would create hundreds of frames per ship.

Version 1 therefore uses schematic 2D tactical representation.

The module shall not claim that rotating a flat side-view image produces a physically correct vessel projection.

A future renderer may support:

- 3D models;
- multi-angle sprite atlases;
- generated orientation sprites.

Those are explicitly outside v1.

---

# 42. Artwork Forward Reference

Custom artwork may declare a forward-reference offset so the module knows which direction the original image visually faces.

For Top art this can be used to rotate the identity image correctly relative to heading.

Example:

```text
artForward = 0 degrees
```

meaning the source top sprite is drawn pointing tactical North before rotation.

This metadata affects drawing only.

It never changes canonical heading.

---

# 43. Mirroring Policy

Mirroring is never assumed safe for custom art.

Version 1 may allow opt-in mirroring for specific opposite-view pairs:

- North <-> South;
- East <-> West.

Isometric art shall not be automatically mirrored by default because mirroring changes handedness and can make asymmetrical vessels incorrect.

Fallback order:

1. exact custom view;
2. explicitly allowed compatible mirrored view;
3. single custom tactical icon;
4. matching generic tactical preset;
5. generic marker.

Missing artwork must never make a token disappear.

---

# 44. Supported Art Formats

Version 1 custom tactical rendering should target static image formats supported reliably by the browser and Foundry installation, such as:

- PNG;
- WebP;
- JPEG;
- other explicitly tested static formats.

Animated/video tactical art is out of scope for the MVP.

User-selected art paths are references only and must not be treated as executable content.

---

# 45. Asset Loading

The renderer shall use a dedicated asset manager.

Requirements:

- lazy load only artwork needed by currently visible panels;
- cache decoded images per client session;
- catch load/decode failures;
- fall back without crashing;
- avoid repeatedly requesting the same broken image;
- release or bound custom cache growth.

The Canvas2D renderer should use browser-native decoded image sources rather than depending on undocumented extraction of PIXI internal texture resources.

Foundry's File Picker may be used to choose assets.

If Foundry's public texture APIs are used, interaction with PIXI internals must remain behind a compatibility adapter and be covered by tests.

---

# 46. Scene Background Rendering

Top view may render the Scene's primary background image aligned to the Scene coordinate system.

Version 1 does not promise to reproduce the entire Foundry Canvas.

The custom Top projection does not automatically include:

- Tiles;
- foreground layers;
- walls;
- lighting;
- templates;
- drawings;
- Regions;
- weather effects;
- arbitrary module canvas layers.

The viewer shall communicate that it is a tactical projection, not a second full Foundry Canvas.

For space combat, a Scene background/starfield is expected to be sufficient in many cases.

Vertical and isometric panels use:

- grid;
- tactical background;
- configurable starfield/neutral background;
- token representations.

They do not infer 3D terrain from a 2D Scene image.

---

# 47. Visibility and Information Security

This requirement is mandatory.

A custom Tactical Viewer must never reveal tokens that the calling user should not be able to see in the normal Foundry scene.

For each participating token, the renderer shall evaluate visibility from the perspective of the current user.

When the corresponding PlaceableObject is available, its current `isVisible` state should be used as the primary client-side visibility decision.

At minimum:

- hidden tokens are not shown to non-GMs;
- token-vision/fog restrictions are respected;
- changing controlled vision state causes a visibility refresh;
- GM visibility continues to behave according to Foundry rules.

The module shall not expose hidden information through:

- sprite;
- name label;
- stack count;
- selection hit target;
- hover tooltip;
- movement preview;
- accessibility label.

A GM-only option may display hidden tactical tokens, but that must never change player rendering.

---

# 48. Selection and Hit Testing

Each panel performs hit testing against only tokens visible to the current user.

Selection is local UI state.

Stacked/overlapping tokens produce a selector that contains only visible candidates.

Invisible tokens must not contribute to:

- stack counts;
- hover highlights;
- cursor changes.

---

# 49. Overlapping Tokens

Different 3D positions can collapse to the same 2D screen point in orthographic views.

The viewer shall detect projected overlap.

Recommended behavior:

```text
[ship icon] x3
```

Clicking/tapping opens or cycles visible candidates.

The chooser should include enough hidden-axis context to distinguish them, for example:

```text
Queen       Y=4
Nautiloid   Y=9
Wasp        Y=12
```

The hidden-axis values shown depend on the active projection.

---

# 50. Isometric Depth Sorting

Isometric tokens require deterministic depth ordering.

The projection engine shall calculate a depth key from the same camera/projection basis used for screen position.

Do not rely on a simplistic `x+y+z` sort unless it has been verified for all four isometric cameras.

Selected tokens may be rendered with a final outline layer so selection remains visible without corrupting physical depth ordering.

---

# 51. Permissions

Before committing any tactical update, the module shall call Foundry's document permission API.

Conceptually:

```text
token.canUserModify(game.user, "update", updateData)
```

The UI shall also respect:

- token ownership;
- `locked`;
- `lockRotation`;
- Scene permissions.

Unauthorized actions shall be disabled where possible rather than allowed to fail after the drag.

The server/Foundry Document update remains the final authority.

---

# 52. Concurrent Edits

Foundry Document synchronization is authoritative, but simultaneous users can still attempt conflicting edits.

Version 1 adopts last-authoritative-update behavior while reducing accidental overwrite.

At drag/edit start, the viewer records the relevant canonical fields.

Before commit, it compares them with the current TokenDocument.

If the same fields changed remotely during the interaction:

- cancel the stale local commit by default;
- discard the preview;
- notify the user that the token changed remotely.

Updates to unrelated fields need not cancel the action.

This provides lightweight optimistic conflict detection without introducing a custom server lock.

A future release may add explicit collaborative soft locks using Foundry module sockets.

---

# 53. Synchronization Event Model

All panels consume canonical document state.

Primary flow:

```text
USER ACTION
   |
   v
permission/conflict validation
   |
   v
TokenDocument.update()
   |
   v
Foundry database/socket synchronization
   |
   +--> moveToken for movement completion
   |
   +--> updateToken for document changes
   |
   v
Viewer Event Coordinator
   |
   v
requestAnimationFrame invalidation
   |
   v
affected panels redraw
```

Panel redraw functions must never call `TokenDocument.update()`.

---

# 54. Hook Responsibilities

## 54.1 `moveToken`

Use for finalized movement fields:

- x;
- y;
- elevation;
- other Foundry movement fields relevant to token geometry.

It is suitable for refreshing movement-dependent projection state after Foundry completes the movement workflow.

## 54.2 `updateToken`

Use for non-movement tactical changes, especially:

- rotation;
- pitch flag;
- tactical participation;
- tactical artwork;
- name/hidden/visibility-relevant changes;
- size/configuration changes.

If an update includes movement fields that will also generate `moveToken`, the event coordinator shall prevent duplicate work.

## 54.3 Render batching

Multiple hook events in one browser tick shall coalesce into one queued repaint per affected viewport.

---

# 55. External Token Changes

The viewer must correctly respond when token state changes outside Tactical Viewer.

Examples:

- native Foundry drag;
- native Foundry rotation;
- Token Configuration edits;
- macros;
- another module;
- GM bulk update.

External rotation is rendered through the OrientationAdapter.

The module shall not silently rewrite an arbitrary external rotation merely because it is off the tactical 45-degree headings.

Instead:

- show the nearest tactical heading for schematic display;
- optionally show an `OFF HEADING` indicator;
- snap/persist only after an explicit Tactical Viewer heading edit.

This avoids fighting other modules.

---

# 56. Rendering Architecture

Version 1 shall use one `ApplicationV2` containing one to four HTML `<canvas>` tactical render surfaces plus normal HTML controls.

It shall not create:

- additional Foundry Scenes;
- multiple full Foundry WebGL canvases;
- a second Foundry token layer;
- a required PIXI application per panel.

Canvas2D is the preferred MVP renderer because it is isolated, straightforward, and adequate for the expected tactical token count.

The renderer shall remain behind an interface so a future WebGL/Pixi renderer can replace it if profiling proves necessary.

---

# 57. Canvas2D Rendering Layers

Recommended logical layers:

1. background;
2. static grid;
3. tactical token sprites;
4. projected orientation vectors;
5. labels;
6. selection/hover;
7. movement preview;
8. stack indicators;
9. debug overlay.

Static background/grid should be cached where practical.

Dynamic token/overlay content may redraw per invalidated animation frame.

---

# 58. High-DPI and Resize Handling

Each panel shall correctly separate:

- CSS display size;
- canvas backing-store size;
- `devicePixelRatio`;
- tactical zoom.

The renderer shall use `ResizeObserver` or equivalent browser layout observation to resize canvases when splitters/application dimensions change.

Client settings may cap effective device-pixel-ratio on low-performance devices.

Pointer coordinates shall be converted from CSS pixels to tactical/canvas coordinates correctly.

---

# 59. Rendering Performance

Performance requirements:

- no continuous redraw loop when nothing changes;
- use dirty/invalidation rendering;
- coalesce hook bursts via `requestAnimationFrame`;
- cull tokens outside the visible panel region;
- cache static grid/background;
- cache decoded images;
- avoid DOM nodes per grid cell;
- avoid synchronous image decoding during drag;
- avoid rebuilding the entire ApplicationV2 DOM for each token movement.

Initial target:

```text
4 panels
50 visible tactical tokens
grid enabled
names enabled
orientation indicators enabled
```

should remain comfortably interactive on a normal desktop client.

Stress target:

```text
100 tactical tokens
4 panels
```

shall be profiled and documented.

Performance criteria should be based on measured frame/update latency rather than an assumed token count alone.

---

# 60. User Interface State

The Tactical Viewer application owns:

```text
ViewerState
  selectedTokenId
  sharedFocus
  sharedScale
  panelCount
  links
  panels[4]
```

Each panel owns:

```text
PanelState
  projection
  focus
  scale
  overlays
  dimensions
```

Game-state values such as XYZ/heading/pitch are not stored here as authority.

They are recomputed from TokenDocuments.

---

# 61. Panel View Changes

Changing a panel from one projection to another:

- keeps the same selected token;
- keeps the same logical focus point;
- keeps equivalent scale where possible;
- does not alter token state;
- does not alter other users.

If Link Center is off, the panel retains its own focus.

---

# 62. Vertical View Initial Framing

Vertical panels have no finite Scene height in Z.

When first opened they should frame:

- participating visible tokens;
- Z=0 plane;
- a configurable/default margin.

Example:

```text
min visible Z - 2 cells
max visible Z + 2 cells
```

Users can then pan/zoom freely.

This auto-fit is a viewer operation only and does not constrain legal elevation.

---

# 63. Native Levels / Elevation Constraints

Foundry v14 may associate tokens with Level data or other core systems that constrain elevation.

Tactical Viewer shall not maintain a parallel Level model.

It updates elevation through normal TokenDocument APIs and then accepts the authoritative result.

If Foundry clamps or rejects the requested Z:

- the preview resolves to the accepted position;
- the user is notified if the destination differs materially.

---

# 64. Token Configuration UI

Tactical settings shall be added to placed Token Configuration and, where practical, Prototype Token Configuration.

Minimum controls:

```text
3D Tactical Viewer
[ ] Participate

Default/Current Pitch: [ -90 | -45 | 0 | +45 | +90 ]

Tactical Art
Preset: [Generic Ship v]
Custom Tactical Icon: [Choose]
Advanced View Art: [Configure...]
```

Advanced art configuration can contain the nine fixed view slots without cluttering the normal Token form.

---

# 65. Viewer Options

Viewer-level settings:

```text
Panels: [1] [2] [3] [4]

[x] Link Selection
[x] Link Center
[x] Link Zoom
```

Panel options:

```text
[x] Grid
[x] Token Names
[x] Elevation
[x] Heading
[x] Pitch
[x] Coordinates
[ ] Debug Axes
```

No map-rotation control exists.

No camera-rotation control exists.

---

# 66. Keyboard and Pointer Input

Pointer Events should be used for custom dragging so mouse, pen, and touch share one interaction path.

A drag is not the sole interaction method.

The module shall provide accessible button/keyboard alternatives for:

- move one cell on visible axes;
- move Z +/-1 where applicable;
- heading +/-45;
- pitch +/-45;
- reset panel;
- zoom in/out.

Keyboard shortcuts apply only when Tactical Viewer or a tactical panel has focus and must not globally intercept typing.

Default shortcuts must avoid conflicts with Foundry core.

---

# 67. Accessibility

Requirements:

- standard HTML buttons/selects/checkboxes;
- visible focus state;
- ARIA labels for icon-only controls;
- no state conveyed by color alone;
- screen-reader-readable selected-token summary;
- stack chooser accessible by keyboard;
- adequate contrast;
- minimum practical touch target size;
- respect `prefers-reduced-motion`;
- all user-visible strings localizable through Foundry i18n.

Canvas content shall have an accompanying accessible summary for the selected token and current panel rather than attempting to expose every canvas primitive.

---

# 68. Mobile and Small Screens

Foundry itself is primarily desktop-oriented, but Tactical Viewer should not assume a large monitor.

For narrow application widths:

- toolbars wrap or collapse;
- panel controls remain usable;
- minimum panel sizes are enforced;
- 3/4-panel layouts may become impractical and should warn rather than overlap controls;
- users can reduce to 1 or 2 panels at any time.

No horizontal browser-page overflow should be introduced by the application.

---

# 69. Application Window / Pop-Out

`ApplicationV2` is the viewer host.

The core requirement is a movable/resizable Foundry application window.

Separate-browser-window behavior is not required for v1 and must not be assumed until tested on the target Foundry build.

If Foundry-provided pop-out behavior is available and stable, the module may support it without changing application state architecture.

---

# 70. Error Handling

The module must recover from:

- missing artwork;
- failed artwork decode;
- invalid pitch;
- arbitrary external rotation;
- Scene grid changed after enablement;
- Scene becomes gridless/hex;
- token deleted while selected;
- tactical participation disabled while selected;
- user permissions changed;
- token hidden/vision state changed;
- Scene switched;
- Scene deleted;
- stale user layout;
- schema migration failure;
- rejected movement;
- elevation clamping;
- duplicate hook notifications;
- resize to zero/very small panel;
- disconnected/reconnected client.

Errors affecting one token should not crash the entire viewer.

---

# 71. Schema Versioning and Migration

Persistent structured data includes `schemaVersion`.

Migration rules:

- migrations are idempotent;
- migrations run before data is consumed;
- old unknown properties are preserved when safe;
- destructive migrations require explicit version handling;
- failures produce a warning and safe fallback;
- rendering never mutates schema as a side effect.

The module shall include automated migration fixtures for every released persistent schema.

---

# 72. Suggested Persistent Schema

## 72.1 Scene

```text
flags.tactical-3d-viewer = {
  schemaVersion: 2,
  enabled: true
}
```

## 72.2 Prototype/Placed Token

```text
flags.tactical-3d-viewer = {
  schemaVersion: 2,
  enabled: true,
  pitch: 0,

  art: {
    preset: "generic-ship",
    icon: "",
    forwardOffset: 0,

    mirror: {
      northSouth: false,
      eastWest: false
    },

    views: {
      top: "",
      north: "",
      south: "",
      east: "",
      west: "",
      iso-ne: "",
      iso-se: "",
      iso-sw: "",
      iso-nw: ""
    }
  }
}
```

## 72.3 User-scoped layout setting

```text
{
  schemaVersion: 2,

  defaults: {
    panelCount: 3,
    linkSelection: true,
    linkCenter: true,
    linkZoom: true
  },

  scenes: {
    "<scene-id>": {
      lastUsed: 0,
      panelCount: 3,
      links: {
        selection: true,
        center: true,
        zoom: true
      },
      panels: [
        { view: "top" },
        { view: "north" },
        { view: "iso-ne" },
        { view: "west" }
      ],
      splits: []
    }
  }
}
```

Transient focus/scale are omitted by default.

---

# 73. Security

The module shall:

- use Foundry Document APIs for writes;
- respect Foundry authorization;
- respect Foundry visibility;
- never expose invisible token metadata through custom rendering;
- treat artwork paths as data only;
- perform no arbitrary code evaluation;
- require no external network service;
- namespace all persistent data;
- avoid system Actor data mutation;
- avoid unrestricted HTML injection from token names or art metadata;
- escape/safely render user-supplied text in HTML tooltips.

---

# 74. Module Compatibility

Version 1 requires no other module.

Compatibility principles:

- do not monkey-patch core methods if hooks/public APIs suffice;
- do not replace the Foundry Canvas;
- do not modify another module's flags;
- do not force native token selection;
- do not continuously rewrite rotation/elevation values from hooks;
- accept externally updated TokenDocuments as authoritative;
- isolate Foundry-version-specific API calls behind adapters.

Potential integrations such as ship sheets, movement-rule modules, Elevation Ruler, or 3D modules are optional future work.

---

# 75. Public Integration API

A small documented API should be exposed after the core MVP stabilizes.

Candidate methods:

```text
openViewer()
closeViewer()
isSceneEnabled(scene)
getTacticalState(token)
setPitch(token, pitch)
setHeading(token, heading)
moveToken3d(token, delta)
refreshToken(token)
registerArtPreset(preset)
```

All state-changing API methods must use the same permission, snapping, conflict, and Document-update pipeline as UI actions.

---

# 76. Extension Hooks

Future external integrations may listen to module hooks such as:

```text
tactical3d.viewerOpened
tactical3d.viewerClosed
tactical3d.selectionChanged
tactical3d.pitchChanged
tactical3d.headingChanged
tactical3d.moveCommitted
```

These events supplement Foundry's normal document hooks and must not become a second authoritative synchronization bus.

---

# 77. MVP Scope

The recommended MVP is intentionally smaller than the complete vision.

## MVP must include

- square-grid Scene validation;
- Scene enable flag;
- token participation flag;
- pitch flag;
- Top view;
- North view;
- East view;
- 1-4 panels;
- per-panel view dropdown;
- synchronized token movement;
- heading editing;
- pitch editing;
- Link Selection;
- Link Center;
- Link Zoom;
- visibility enforcement;
- permission enforcement;
- generic tactical icons;
- user-scoped layout persistence;
- Canvas2D renderer;
- multi-client synchronization;
- unit tests for coordinate/projection/orientation math.

## MVP may initially omit

- South/West if North/East prove the mirrored projection framework;
- all four isometric views until orthographic movement is proven;
- custom per-view art;
- stack chooser polish;
- advanced accessibility shortcuts;
- public integration API.

However the production v1 release shall include all nine declared projection choices if the fixed-view artwork/configuration contract is published as v1.

---

# 78. Recommended Implementation Phases

## Phase 0 - Technical spikes

Before broad implementation, prove:

1. ApplicationV2 can host 1-4 responsive Canvas2D panels.
2. Square-grid token center/grid conversion is correct for 1x1, 2x2, 3x2 tokens.
3. X/Y/Z update from a custom panel produces expected Foundry movement events.
4. Pitch flag updates synchronize to a second client.
5. Foundry visibility can be mirrored safely using Token `isVisible`.
6. Canvas2D rendering remains responsive with 100 schematic tokens.
7. user-scoped settings persist across reconnect/login as expected.

No-Go if any of these require unstable core patching.

## Phase 1 - Coordinate and synchronization core

Implement:

- Scene validation;
- coordinate adapter;
- orientation adapter;
- tactical state builder;
- event coordinator;
- visibility filter;
- permission checks;
- Top view;
- North view;
- movement preview/commit;
- basic tests.

## Phase 2 - Viewer layout

Implement:

- ApplicationV2 shell;
- 1-4 panels;
- splitters;
- per-panel dropdown;
- user-scope persistence;
- linked selection/center/zoom;
- East/West/South.

## Phase 3 - Orientation and isometric

Implement:

- heading editor;
- pitch editor;
- orientation vector;
- four isometric projections;
- depth sorting;
- overlap selection.

## Phase 4 - Artwork

Implement:

- generic atlas/icons;
- custom tactical icon;
- per-view overrides;
- fallback;
- explicit mirroring;
- file-picker workflow;
- cache/failure handling.

## Phase 5 - Hardening

Implement/test:

- multi-user conflict handling;
- vision/fog changes;
- Scene lifecycle;
- migrations;
- accessibility;
- performance;
- localization;
- packaging;
- documentation.

---

# 79. Test Strategy

Testing shall be divided into pure unit tests, Foundry integration tests, and manual multi-client scenarios.

## 79.1 Pure unit tests

No Foundry runtime should be required for:

- heading normalization;
- pitch normalization;
- orientation vector;
- Chebyshev distance;
- projection matrices;
- inverse projection where supported;
- isometric depth keys;
- user-layout migrations;
- art fallback selection.

## 79.2 Foundry integration tests

Test:

- Scene square-grid detection;
- Scene flag;
- Token flag;
- prototype-token inheritance;
- token center conversion;
- grid snapping;
- elevation conversion;
- permissions;
- visibility;
- rotation conversion;
- movement hook/update hook coordination;
- delete/create/update lifecycle.

## 79.3 Multi-client tests

At minimum:

- GM + owner player;
- GM + observer;
- two users who can both update the same token;
- hidden token;
- token outside active user's vision;
- remote movement during local preview;
- remote pitch/heading update;
- different panel counts on each client;
- reconnect during active Scene.

---

# 80. Required Coordinate Test Matrix

Test token footprints:

```text
1x1
2x2
3x2
1x3
```

Test positions:

- Scene origin;
- Scene padding edges;
- center;
- near bounds;
- negative/positive elevations.

Test grid distances:

```text
1
5
10
100
```

Test off-grid values.

A move of one tactical X/Y cell must change the token anchor by exactly one square-grid step regardless of footprint size.

---

# 81. Required Orientation Test Matrix

Headings:

```text
000
045
090
135
180
225
270
315
```

Pitch:

```text
+90
+45
0
-45
-90
```

All 40 combinations shall produce a valid finite orientation vector.

Each combination shall be projected into:

- Top;
- North;
- South;
- East;
- West;
- four isometrics.

No projected orientation may produce NaN/Infinity.

---

# 82. Required Visibility Tests

For a non-GM user test:

- visible token;
- hidden token;
- visible participant behind fog/vision;
- token becomes visible;
- token becomes invisible;
- selected token becomes invisible;
- invisible token overlapping a visible token.

Expected result:

The Tactical Viewer reveals no state for the invisible token.

For a GM:

Verify core-equivalent visibility and optional hidden-token presentation.

---

# 83. Required Concurrency Tests

Scenario:

1. User A starts dragging token.
2. User B commits a move on same token.
3. User A drops stale preview.

Expected:

- User A does not overwrite B silently.
- A receives a remote-change message.
- viewer redraws authoritative position.

Also test simultaneous changes to unrelated fields:

- A changes pitch;
- B changes X/Y.

Both should survive because updates are partial and fields do not conflict.

---

# 84. Performance Test Matrix

Benchmark:

```text
10 tokens / 1 panel
50 tokens / 2 panels
50 tokens / 4 panels
100 tokens / 4 panels
```

With:

- grid on/off;
- labels on/off;
- custom images/generic images;
- linked center/zoom;
- rapid remote updates.

Record:

- repaint duration;
- event-to-visible-update latency;
- memory use;
- image-cache count;
- CPU usage during idle.

Idle viewer must not continuously consume significant CPU.

---

# 85. Acceptance Criteria

## Scene

- GM can enable Tactical Viewer only on supported square-grid Scenes.
- Unsupported grid type is clearly rejected.
- Disabling a Scene does not delete token configuration.

## Panels

- each user can choose 1-4 panels;
- each panel can independently select any supported view;
- duplicate views work;
- panel resizing works;
- one user's layout does not change another user's layout.

## Position

- Top modifies X/Y only;
- North/South modify X/Z only;
- East/West modify Y/Z only;
- hidden coordinate is preserved;
- Z converts correctly to Foundry elevation;
- native Foundry moves appear in Tactical Viewer;
- all clients converge on the authoritative TokenDocument.

## Orientation

- heading snaps to eight tactical headings when edited through viewer;
- pitch snaps to five values;
- native rotation remains persisted heading source;
- orientation vector is consistent across views;
- token `locked` and `lockRotation` are respected.

## Visibility

- players never see tokens Foundry considers invisible;
- no metadata leaks through labels, stacks, or hit testing;
- visibility updates without Scene reload.

## Artwork

- generic icon always works;
- custom icon works;
- partial view overrides work;
- broken asset falls back;
- no missing asset crashes the viewer;
- orientation remains understandable even with approximate art.

## Synchronization

- render hooks never write game state;
- no update loop occurs;
- movement hook and update hook do not cause duplicate commit behavior;
- simultaneous stale edits are detected where they modify the same fields.

## Persistence

- Scene enable state persists;
- tactical token flags persist;
- user panel layout persists;
- layout settings use user scope, not client scope;
- client-only performance settings do not affect other devices.

---

# 86. Outstanding Product Decisions

These decisions should be explicitly resolved before production implementation.

## 86.1 Visibility behavior

**Recommended decision:** respect Foundry `Token.isVisible` for players.

Do not make "all tactical ships globally visible" the default because that can leak hidden game information.

## 86.2 Scene background fidelity

**Recommended decision:** v1 Top panel renders the Scene background image plus tactical tokens, not a replica of all Foundry canvas layers.

If a full Foundry Canvas replica is required, the architecture must be reconsidered.

## 86.3 Multi-cell collision

**Recommended decision:** center-anchor only in v1; token width/height/depth are visual and do not create occupied collision cubes.

## 86.4 Exact sprite orientation

**Recommended decision:** tactical art is schematic. Orientation vector is authoritative.

Do not require hundreds of raster orientation frames.

## 86.5 Native token-control synchronization

**Recommended decision:** keep Tactical Viewer selection local in v1.

Do not automatically call Foundry token `control()` because that can affect vision and other module behavior.

## 86.6 Isometric input

**Recommended decision:** view/select only in v1.

Do not invent ambiguous free dragging.

## 86.7 Movement-rule enforcement

**Recommended decision:** no speed/heading/turn enforcement in core v1.

Expose extension points later.

---

# 87. Go / No-Go Risks

## Blocker: visibility cannot be reproduced safely

If a custom renderer cannot reliably determine whether a token is visible to the current user on the target Foundry build, player-facing use should not ship until this is solved.

Information leakage is a release blocker.

## Blocker: coordinate adapter cannot preserve Foundry token placement

If square-grid center/snapping conversion causes drift for normal multi-cell tokens, interactive movement should not ship until the adapter is corrected or v1 is restricted to 1x1 tactical anchors.

## High: update-hook behavior causes duplicate/recursive writes

Any architecture requiring writes from render/update hooks is a no-go.

Canonical writes must originate only from explicit actions/integration API calls.

## High: full Canvas replacement becomes required

If the product requirement changes to "each panel is a complete Foundry Scene Canvas including walls, lighting, tiles, templates, vision, and module layers," Canvas2D projections are no longer the correct architecture.

That would require a separate design investigation.

## Medium: sprite expectations become photorealistic

If users require exact vessel appearance for every heading/pitch in every view, raster token packs become impractical.

A 3D model or multi-angle rendering pipeline would be the better architecture.

## Medium: 100-token/4-panel performance misses target

Canvas2D may be replaced behind the renderer interface with a WebGL/Pixi implementation without changing game-state architecture.

---

# 88. Recommended Internal Architecture

```text
Tactical3DModule
|
+-- SceneEligibilityService
|
+-- CoordinateAdapter
|   +-- Foundry pixels <-> tactical coordinates
|   +-- footprint center
|   +-- square-grid snapping
|   +-- elevation <-> Z
|
+-- OrientationAdapter
|   +-- Foundry rotation <-> tactical heading
|   +-- pitch normalization
|   +-- forward vector
|
+-- TacticalStateService
|   +-- reads TokenDocuments
|   +-- visibility
|   +-- permissions
|
+-- TacticalUpdateService
|   +-- validation
|   +-- conflict detection
|   +-- document writes
|
+-- SynchronizationCoordinator
|   +-- moveToken
|   +-- updateToken
|   +-- create/delete token
|   +-- Scene lifecycle
|   +-- rAF invalidation
|
+-- ProjectionEngine
|   +-- Top
|   +-- North/South
|   +-- East/West
|   +-- four isometrics
|
+-- AssetManager
|   +-- generic presets
|   +-- custom images
|   +-- cache
|   +-- fallback
|
+-- TacticalViewerApplication (ApplicationV2)
    |
    +-- LayoutManager
    +-- Viewport 1
    +-- Viewport 2
    +-- Viewport 3
    +-- Viewport 4
```

Foundry-specific assumptions are concentrated in adapters/services rather than spread through rendering code.

---

# 89. Recommended Project Layout

```text
tactical-3d-viewer/
|
+-- module.json
+-- README.md
+-- LICENSE
|
+-- scripts/
|   +-- main.js
|   +-- constants.js
|   +-- settings.js
|   |
|   +-- foundry/
|   |   +-- scene-integration.js
|   |   +-- token-integration.js
|   |   +-- hooks.js
|   |   +-- visibility-adapter.js
|   |
|   +-- model/
|   |   +-- coordinate-adapter.js
|   |   +-- orientation-adapter.js
|   |   +-- tactical-state.js
|   |   +-- update-service.js
|   |
|   +-- projection/
|   |   +-- projection-engine.js
|   |   +-- orthographic.js
|   |   +-- isometric.js
|   |
|   +-- viewer/
|   |   +-- tactical-viewer.js
|   |   +-- layout-manager.js
|   |   +-- viewport.js
|   |   +-- input-controller.js
|   |
|   +-- rendering/
|   |   +-- canvas-renderer.js
|   |   +-- grid-renderer.js
|   |   +-- token-renderer.js
|   |   +-- asset-manager.js
|   |
|   +-- persistence/
|       +-- migrations.js
|       +-- user-layouts.js
|
+-- templates/
|   +-- tactical-viewer.hbs
|   +-- token-tactical-config.hbs
|   +-- scene-tactical-config.hbs
|
+-- styles/
|   +-- tactical-viewer.css
|
+-- assets/
|   +-- generic/
|
+-- lang/
|   +-- en.json
|
+-- tests/
    +-- unit/
    +-- integration/
    +-- fixtures/
```

---

# 90. Final Architecture Statement

3D Tactical Viewer is not a 3D engine and is not a collection of synchronized duplicate maps.

It is:

> **one Foundry Scene, one authoritative TokenDocument per object, one canonical XYZ/heading/pitch state, and one to four user-configurable 2D projections of that state.**

The most important implementation rules are:

1. Use Foundry Documents as authority.
2. Use square-grid APIs rather than raw pixel arithmetic.
3. Derive position from token center/footprint, not top-left x/y.
4. Treat Foundry elevation as authority and convert it explicitly to tactical Z.
5. Keep heading mapped to native rotation through one adapter.
6. Store pitch in one namespaced token flag.
7. Respect visibility as strictly as permissions.
8. Never write state from render/update hooks.
9. Keep panel layout user-local.
10. Keep tactical art schematic and orientation vectors authoritative.
11. Prove orthographic movement and synchronization before adding presentation complexity.
12. Keep isometric movement read-only until an unambiguous interaction is designed.

This architecture preserves the original Spelljammer/cubic-battlespace concept while removing the highest-risk assumptions identified by the critical review.

---

# 91. Authoritative Reference Links

Foundry VTT v14 API and development references used to validate this revision:

- ApplicationV2: https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html
- Applications namespace: https://foundryvtt.com/api/modules/foundry.applications.html
- ClientSettings / world-user-client setting scopes: https://foundryvtt.com/api/classes/foundry.helpers.ClientSettings.html
- SettingConfig: https://foundryvtt.com/api/interfaces/foundry.types.SettingConfig.html
- TokenDocument: https://foundryvtt.com/api/classes/foundry.documents.TokenDocument.html
- Token / `isVisible`: https://foundryvtt.com/api/v14/classes/foundry.canvas.placeables.Token.html
- Token data: https://foundryvtt.com/api/interfaces/foundry.documents.types.TokenData.html
- Token position: https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.TokenPosition.html
- SquareGrid: https://foundryvtt.com/api/classes/foundry.grid.SquareGrid.html
- BaseGrid: https://foundryvtt.com/api/classes/foundry.grid.BaseGrid.html
- Scene dimensions: https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.SceneDimensions.html
- `moveToken` hook: https://foundryvtt.com/api/v14/functions/hookEvents.moveToken.html
- Foundry Document updates: https://foundryvtt.com/api/v14/modules/foundry.documents.html
- Module development / manifest: https://foundryvtt.com/article/module-development/
- Token user documentation: https://foundryvtt.com/article/tokens/
