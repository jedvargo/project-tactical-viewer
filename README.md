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

## Tactical tokens

Tokens use their native Foundry texture, name, footprint, elevation, and
orientation. Token-specific Tactical Viewer configuration is not added to Token
Configuration; dropped Actors and images become real TokenDocuments on the
active tactical grid. Artwork is rendered as identity art while the
heading/pitch orientation vector remains authoritative.

## Panels and links

Choose 1, 2, 3, or 4 panels. Each visible panel independently selects Top,
North, South, East, West, Isometric NE, Isometric SE, Isometric SW, or
Isometric NW. Duplicate views are allowed and hidden panel settings are
retained. Resizable splitters adapt to narrow windows.

Panel Options includes a grid-opacity slider. The shared Options menu can set
the tactical grid X/Y/Z dimensions, background color or image, and choose
whether the viewer remains a normal window, sizes itself to the Scene, or fills
the viewport to replace the Scene presentation. These are user-local per-Scene
preferences. Token artwork is rendered in isometric panels as well as
orthographic panels.

Actors and supported token/image drag payloads can be dropped onto any
orthographic panel. The drop is snapped to the tactical grid and creates a
real TokenDocument in the active Scene. Isometric panels are read-only drop
surfaces because a 2D drop cannot uniquely determine all three coordinates.
Actor drops preserve the Actor's token prototype footprint. Panel Options also
provide selected-token width and height controls from 1 to 20 squares, so a
ship can occupy a rectangular footprint such as 2x1. The footprint is used by
all projections and image drops default to 1x1 unless dimensions are supplied.

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

## Token art

Native Token textures are loaded lazily. A broken or missing image never
removes a token from the viewer; the footprint remains represented until the
texture is available.

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
- If a token is absent, confirm the native texture and Foundry visibility; a
  player cannot see a token that Foundry hides or places outside permitted
  vision.
- If movement controls are disabled, check token ownership/update permission,
  movement/rotation locks, and whether the selected panel is isometric.
- If art is absent, verify the file path is readable by the client. The generic
  marker is the expected fallback.
- Check the browser console for the first error after reloading, then run the
  automated checks below. Include Foundry version, Scene grid type, and module
  version when reporting a reproducible issue.

## Privacy and security

The module stores shared enablement in Scene flags, legacy tactical token
compatibility flags in TokenDocuments, and layout preferences in the Foundry
user setting. Rendering preferences are client-scoped. It does not
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

## Local Foundry Development / Hot Reload

For local development, remove or rename any installed release copy first, then
link the repository into Foundry's module directory. On Linux:

```bash
ln -s /path/to/tactical-3d-viewer \
  ~/.local/share/FoundryVTT/Data/modules/tactical-3d-viewer
```

The symlink directory name must match the module ID,
`tactical-3d-viewer`, and `module.json` must be at the root of the linked
repository/module directory. Start Foundry with `--hotReload` to enable
automatic package hot reload.

Hot reload is intended for runtime assets under `scripts/`, `styles/`,
`templates/`, and `lang/`. In this repository, the manifest watches the
directories that currently exist: `scripts/`, `styles/`, and `lang/`; the
supported file extensions include Handlebars and HTML when template files are
added. Some stateful or startup-level changes still require a browser reload
or Foundry/world reload, especially module manifest structure changes,
init/ready lifecycle changes, module enable/disable changes, or changes whose
old runtime state is already instantiated. Hot reload does not guarantee safe
replacement of every already-instantiated JavaScript application state.
