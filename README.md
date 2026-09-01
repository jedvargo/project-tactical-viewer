# 3D Tactical Viewer

3D Tactical Viewer is a system-agnostic Foundry VTT v14 module for synchronized
2D projections of one cubic tactical battlespace. It uses the active Scene and
its TokenDocuments as the authoritative shared state.

## Install

Install the release ZIP from Foundry's Add-on Modules installer, or copy/link
the module directory containing `module.json` into the world's `Data/modules`
directory. The ZIP has `module.json` at its root. Enable the module in the
World's Add-on Modules list, then reload the World.

The module ships with no runtime JavaScript dependency and does not require any
other module.

## Enable a Scene

Open Scene Configuration and enable **3D Tactical Viewer**. Only square-grid
Scenes with positive grid size, grid distance, and dimensions can be enabled.
Use `Ctrl+Shift+V` (customizable in Foundry Keybindings) to reopen the viewer
after closing it. Scene enablement is shared; the viewer layout is per user.

## Configure tactical tokens

In Token Configuration, enable **Participate in 3D Tactical Viewer**, choose a
pitch, and optionally choose a generic preset or custom tactical icon. Advanced
art configuration provides an icon for each fixed view, a forward reference,
and opt-in mirroring for North/South or East/West. Artwork is schematic identity
art; the heading/pitch orientation vector remains authoritative.

## Panels and links

Choose 1, 2, 3, or 4 panels. Each visible panel independently selects Top,
North, South, East, West, Isometric NE, Isometric SE, Isometric SW, or
Isometric NW. Duplicate views are allowed and hidden panel settings are
retained. Resizable splitters adapt to narrow windows.

The three user-local links are **Link Selection**, **Link Center**, and
**Link Zoom**. Turn any link off to navigate that panel independently.

## Movement and orientation

Top edits X/Y. North and South edit X/Z. East and West edit Y/Z. One vertical
step changes Foundry elevation by exactly the Scene grid distance. Heading uses
Foundry token rotation and Tactical Viewer edits it in 45-degree steps. Pitch
uses the five supported values: +90, +45, 0, -45, and -90 degrees.

All gameplay writes go through the authoritative TokenDocument update path and
are synchronized by Foundry. Isometric panels are read-only for movement; use
an orthographic panel to move a token. Rendering and hooks never write token
state.

## Custom art

Custom art is loaded lazily with a generic fallback. A broken or missing image
never removes a token from the viewer. Per-view overrides take precedence,
followed by explicitly permitted mirroring, the single custom icon, the chosen
generic preset, and the generic marker.

## Limitations

- Interactive tactical movement is **square-grid only**. Hex and gridless Scenes
  are rejected for v1 movement.
- Isometric views are read-only for movement; they support view, selection, pan,
  and zoom only.
- The viewer uses nine fixed projections. There is no free camera, map rotation,
  3D model rendering, collision system, or game-system integration.
- Off-step external elevations are displayed as off-grid and are not silently
  rewritten by rendering or hooks.

## Troubleshooting

- If the viewer will not open, confirm the Scene is active, enabled, square-grid,
  and has positive grid size, grid distance, width, and height.
- If a token is absent, confirm participation and Foundry visibility; a player
  cannot see a token that Foundry hides or places outside permitted vision.
- If movement controls are disabled, check token ownership/update permission,
  movement/rotation locks, and whether the selected panel is isometric.
- If art is absent, verify the file path is readable by the client. The generic
  marker is the expected fallback.
- Check the browser console for the first error after reloading, then run the
  automated checks below. Include Foundry version, Scene grid type, and module
  version when reporting a reproducible issue.

## Privacy and security

The module stores shared enablement in Scene flags, shared tactical token
configuration in TokenDocument/prototype-token flags, and layout preferences in
the Foundry user setting. Rendering preferences are client-scoped. It does not
send data to an external service, create duplicate Scenes, or store a second
authoritative position. The custom renderer applies Foundry's current-user
visibility and permission results to sprites, names, labels, hit testing,
overlap counts, and accessibility summaries.

## Development and tests

Production code is native ES modules with no third-party runtime dependency.
Install development dependencies and run:

```text
npm install
npm test
npm run test:unit
npm run test:integration
npm run package:release
npm run verify:release
npm run test:release
```

`test:release` builds a ZIP with module contents at its root, extracts it into a
temporary clean directory, checks its manifest/assets/dependency boundary, and
imports the installed entrypoint. Real Foundry v14 acceptance remains a manual
browser/client check; use the checklists in `tests/manual/`.
