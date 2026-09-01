# Foundry v14 acceptance matrix

Run this checklist in a clean Foundry VTT v14 World with the release ZIP
installed. Record browser/Foundry version, date, tester, and console result.

## Bootstrap and Scene eligibility

- [ ] Module is recognized, enabled, and reloads without console errors.
- [ ] `Ctrl+Shift+V` reopens the viewer after it is closed; no permanent
      side-toolbar button is required.
- [ ] A valid square-grid Scene enables and opens the viewer.
- [ ] Gridless and hex Scenes show a clear unsupported message and cannot be
      enabled for interactive movement.
- [ ] Scene disablement closes/ disables an open viewer without changing token
      flags or position.

## Coordinates and canonical state

- [ ] With non-zero Scene padding, a 1x1 token is centered on its expected cell.
- [ ] A 2x2 token is centered on its footprint; one cell move is one cell.
- [ ] Negative elevation displays correctly.
- [ ] Off-step elevation displays the true value and an `OFF GRID` indicator;
      render/update hooks do not snap it.
- [ ] Top drag changes X/Y only; North/South change X/Z; East/West change Y/Z.
- [ ] One vertical step changes elevation by exactly the Scene grid distance.
- [ ] Isometric drag pans/selects but never moves a token.

## Views, panels, and links

- [ ] Each panel can select Top, North, South, East, West, Isometric NE, SE,
      SW, and NW, and every choice renders tokens/grid.
- [ ] 1, 2, 3, and 4 panel layouts render and resize correctly.
- [ ] Hidden panel view configuration is retained when panel count is reduced.
- [ ] Link Selection synchronizes selection only when enabled.
- [ ] Link Center synchronizes the shared 3D focus only when enabled.
- [ ] Link Zoom synchronizes logical cell scale only when enabled.
- [ ] GM and player use different panel counts/views/link settings at the same
      time without affecting one another.

## GM/player synchronization and security

- [ ] GM movement updates the player viewer and player-owned movement updates the
      GM viewer without duplicate movement or feedback loops.
- [ ] External native rotation, elevation, macro updates, token creation, and
      deletion appear after one coalesced redraw.
- [ ] A player cannot see a hidden, fog-obscured, or vision-inaccessible token.
- [ ] Hidden tokens do not contribute to labels, stacks, hit testing, overlap
      chooser entries, or accessible summaries.
- [ ] Selection and controls disappear/disable when visibility or permission is
      lost.
- [ ] Movement/rotation locks and stale concurrent edits are respected.

## Artwork, lifecycle, and accessibility

- [ ] Generic ship/object/creature/marker art renders and broken art falls back.
- [ ] Custom primary and per-view art load through Foundry's File Picker.
- [ ] Scene switching, reload/reconnect, disable/enable, close/reopen, and
      native Foundry token operation leave no errors or stale selection.
- [ ] Keyboard arrows/PageUp/PageDown, heading `[ ]`, and pitch `, .` work with
      a focused canvas; editable fields retain normal text entry.
- [ ] Icon-only controls have accessible names and reduced-motion preference is
      respected.

## Performance and final gate

- [ ] Check 10 tokens/1 panel, 50/2, 50/4, and 100/4; record repaint latency,
      idle CPU, memory, and image-cache size.
- [ ] No continuous idle render loop is observable.
- [ ] Gate 6 passes only after every applicable item above passes and the browser
      console remains free of module errors.
