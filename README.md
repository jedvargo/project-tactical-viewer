# 3D Tactical Viewer

3D Tactical Viewer is a Foundry VTT v14 module for synchronized 2D projections
of a cubic tactical battlespace.

## Development

Install development dependencies and run the automated suite:

```text
npm install
npm test
npm run test:unit
npm run test:integration
```

The module has no runtime JavaScript dependencies. Manual integration checks
require a real Foundry VTT v14 test environment: install or link this module,
enable it in a World, reload, and confirm that the browser console reports no
module initialization errors.
