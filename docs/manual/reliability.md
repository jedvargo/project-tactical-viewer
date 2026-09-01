# Prompt 29 Reliability Check

Use this checklist against a Foundry VTT v14 test World before release:

1. Open the enabled Scene in two clients, reload both clients, and confirm both viewers rebuild from the current TokenDocuments.
2. Disconnect and reconnect one client, then confirm the viewer refreshes without duplicate panels, stale selection, or stale token art.
3. Disable and re-enable the module and the Scene. Confirm disabling closes the viewer but leaves tactical flags and native token data intact.
4. While the viewer is open, move, rotate, and configure a token through Foundry's native controls. Confirm one redraw converges on the accepted canonical document and no update loop occurs.
5. Test a hidden token, a token becoming hidden, a rejected/clamped update, a malformed flag, and a missing/decode-failing image.

The application uses Foundry v14's documented ApplicationV2 lifecycle hooks
`_renderHTML`, `_onRender`, and `_preClose` because those are the framework's
protected extension points. Calls to optional superclass implementations are
guarded, and the compatibility behavior is covered by the ApplicationV2-shaped
viewer tests. No other private Foundry API is used.

This workspace has no linked Foundry v14 executable or test World, so the
manual checklist remains an external smoke-test requirement.
