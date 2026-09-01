# Release ZIP smoke checklist

Automated equivalent: `npm run test:release`.

- [ ] Build `dist/tactical-3d-viewer-<version>.zip` with
      `npm run package:release`.
- [ ] Confirm `module.json` is at the archive root.
- [ ] Confirm the archive contains scripts, styles, `lang/en.json`, assets, and
      README, but no `node_modules`, package manifest, tests, or development
      documentation.
- [ ] Install the ZIP into a clean Foundry v14 test environment.
- [ ] Enable the module, reload, and confirm no browser console errors.
- [ ] Run `foundry-acceptance.md` against the installed release.
