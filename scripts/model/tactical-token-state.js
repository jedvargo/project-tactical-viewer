import { CoordinateAdapter } from "./coordinate-adapter.js";
import { OrientationAdapter } from "./orientation-adapter.js";
import {
  getTacticalTokenFlags,
  getTokenDepth,
  getTokenPitch
} from "./token-flags.js";
import { PermissionService } from "../permission-service.js";
import { VisibilityService } from "../visibility-service.js";

function documentData(tokenDocument) {
  const data = tokenDocument?.document ?? tokenDocument;
  if (!data || typeof data !== "object") {
    throw new TypeError("A placed TokenDocument-like object is required");
  }
  return data;
}

function idOf(value) {
  return value?.id;
}

function actorOf(tokenDocument, data) {
  const actorId = tokenDocument?.actorId ?? data?.actorId;
  return tokenDocument?.actor
    ?? data?.actor
    ?? globalThis?.game?.actors?.get?.(actorId)
    ?? null;
}

function actorNameOf(tokenDocument, data) {
  const actor = actorOf(tokenDocument, data);
  const name = actor?.name ?? actor?.document?.name ?? data?.actorName ?? data?.name;
  return typeof name === "string" ? name : "";
}

function actorTextureOf(tokenDocument, data) {
  const actor = actorOf(tokenDocument, data);
  const source = actor?.texture?.src
    ?? actor?.img
    ?? actor?.prototypeToken?.texture?.src
    ?? actor?.prototypeToken?.img;
  return typeof source === "string" ? source : "";
}

function positiveDimension(value, fallback = 1) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function displayPitch(value, orientationAdapter) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return orientationAdapter.normalizePitch(value);
}

/**
 * Computed, non-authoritative tactical view of one placed TokenDocument.
 * The service never writes the document or stores duplicate XYZ/heading data.
 */
export class TacticalTokenState {
  constructor({
    coordinateAdapter = new CoordinateAdapter(),
    orientationAdapter = new OrientationAdapter(),
    visibilityService = new VisibilityService(),
    permissionService = new PermissionService()
  } = {}) {
    this.coordinateAdapter = coordinateAdapter;
    this.orientationAdapter = orientationAdapter;
    this.visibilityService = visibilityService;
    this.permissionService = permissionService;
  }

  build(tokenDocument, scene, options = {}) {
    const data = documentData(tokenDocument);
    const coordinateOptions = options.grid === undefined ? undefined : { grid: options.grid };
    const coordinates = this.coordinateAdapter.toTactical(
      tokenDocument,
      scene,
      coordinateOptions
    );
    const flags = getTacticalTokenFlags(tokenDocument);
    const rotation = typeof data.rotation === "number" && Number.isFinite(data.rotation)
      ? data.rotation
      : 0;
    const depth = getTokenDepth(tokenDocument);
    const visibleToCurrentUser = this.visibilityService.isVisible(tokenDocument, options);
    const capabilities = this.permissionService.getCapabilities(tokenDocument);
    const textureSource = data.texture?.src ?? data.img ?? "";

    return Object.freeze({
      tokenId: idOf(data) ?? idOf(tokenDocument),
      sceneId: idOf(scene),
      name: typeof data.name === "string" ? data.name : "",
      actorName: actorNameOf(tokenDocument, data),
      actorTextureSource: actorTextureOf(tokenDocument, data),
      textureSource: typeof textureSource === "string" ? textureSource : "",
      anchor: coordinates.anchor,
      anchorTactical: coordinates.anchorTactical,
      centerX: coordinates.centerX,
      centerY: coordinates.centerY,
      elevation: coordinates.elevation,
      tacticalX: coordinates.tacticalX,
      tacticalY: coordinates.tacticalY,
      tacticalZ: coordinates.tacticalZ,
      heading: this.orientationAdapter.foundryRotationToHeading(rotation),
      pitch: displayPitch(getTokenPitch(tokenDocument), this.orientationAdapter),
      width: coordinates.width,
      height: coordinates.height,
      depth,
      elevationOnGrid: coordinates.elevationOnGrid,
      elevationOffGrid: coordinates.elevationOffGrid,
      offGrid: coordinates.offGrid,
      enabled: flags.enabled,
      participating: flags.enabled,
      schemaVersion: flags.schemaVersion,
      art: flags.art,
      visibleToCurrentUser,
      canCurrentUserUpdate: capabilities.canUpdate,
      canCurrentUserMove: capabilities.canMove,
      canCurrentUserRotate: capabilities.canRotate,
      canCurrentUserDelete: capabilities.canDelete,
      locked: capabilities.locked,
      lockRotation: capabilities.lockRotation
    });
  }

  fromTokenDocument(tokenDocument, scene, options = {}) {
    return this.build(tokenDocument, scene, options);
  }
}

export function buildTacticalTokenState(tokenDocument, scene, options = {}) {
  const {
    coordinateAdapter,
    orientationAdapter,
    ...stateOptions
  } = options;
  return new TacticalTokenState({ coordinateAdapter, orientationAdapter })
    .build(tokenDocument, scene, stateOptions);
}
