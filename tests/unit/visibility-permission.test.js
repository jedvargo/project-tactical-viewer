import { describe, expect, it, vi } from "vitest";

import { PermissionService } from "../../scripts/permission-service.js";
import { VisibilityService } from "../../scripts/visibility-service.js";

function tokenDocument({
  id = "token",
  locked = false,
  lockRotation = false,
  canUserModify = vi.fn(() => true)
} = {}) {
  return {
    id,
    locked,
    lockRotation,
    canUserModify
  };
}

describe("VisibilityService", () => {
  it("uses the current placeable isVisible signal for GMs and players", () => {
    const gm = { id: "gm", isGM: true };
    const player = { id: "player", isGM: false };
    const document = tokenDocument({ id: "visible" });

    expect(new VisibilityService({ currentUser: gm }).isVisible(document, {
      placeable: { isVisible: true }
    })).toBe(true);
    expect(new VisibilityService({ currentUser: player }).isVisible(document, {
      placeable: { isVisible: true }
    })).toBe(true);
    expect(new VisibilityService({ currentUser: gm }).isVisible(document, {
      placeable: { isVisible: false }
    })).toBe(false);
    expect(new VisibilityService({ currentUser: player }).isVisible(document, {
      placeable: { isVisible: false }
    })).toBe(false);
  });

  it("fails closed for a non-GM when a placeable is temporarily unavailable", () => {
    const document = tokenDocument();
    const service = new VisibilityService({
      currentUser: { id: "player", isGM: false }
    });

    expect(service.isVisible(document)).toBe(false);
  });

  it("accepts a PlaceableObject directly when it is supplied by a caller", () => {
    const service = new VisibilityService({
      currentUser: { id: "player", isGM: false }
    });

    expect(service.isVisible({ document: tokenDocument(), isVisible: true })).toBe(true);
  });

  it("allows a GM fallback when the document exists but its placeable is unavailable", () => {
    const service = new VisibilityService({
      currentUser: { id: "gm", isGM: true }
    });

    expect(service.isVisible(tokenDocument())).toBe(true);
  });
});

describe("PermissionService", () => {
  it("delegates update permission to TokenDocument.canUserModify", () => {
    const user = { id: "owner", isGM: false };
    const canUserModify = vi.fn(() => true);
    const document = tokenDocument({ canUserModify });
    const service = new PermissionService({ currentUser: user });
    const update = { x: 200 };

    expect(service.canUpdate(document, update)).toBe(true);
    expect(canUserModify).toHaveBeenCalledWith(user, "update", update);
  });

  it.each([
    ["unowned", false],
    ["owned", true]
  ])("keeps the Foundry permission result for %s tokens", (_label, allowed) => {
    const canUserModify = vi.fn(() => allowed);
    const service = new PermissionService({
      currentUser: { id: "player", isGM: false }
    });

    expect(service.canUpdate(tokenDocument({ canUserModify }), { x: 1 })).toBe(allowed);
  });

  it("surfaces locked and lockRotation independently", () => {
    const user = { id: "owner", isGM: false };
    const service = new PermissionService({ currentUser: user });
    const locked = tokenDocument({ locked: true, lockRotation: false });
    const rotationLocked = tokenDocument({ locked: false, lockRotation: true });

    expect(service.getLockState(locked)).toEqual({ locked: true, lockRotation: false });
    expect(service.getLockState(rotationLocked)).toEqual({ locked: false, lockRotation: true });
    expect(service.canMove(locked)).toBe(false);
    expect(service.canRotate(locked)).toBe(true);
    expect(service.canMove(rotationLocked)).toBe(true);
    expect(service.canRotate(rotationLocked)).toBe(false);
  });

  it("treats a pitch flag update as a rotation-protected action", () => {
    const service = new PermissionService({
      currentUser: { id: "owner", isGM: false }
    });
    const document = tokenDocument({ lockRotation: true });

    expect(service.canUpdate(document, {
      "flags.tactical-3d-viewer.pitch": 45
    })).toBe(false);
  });
});
