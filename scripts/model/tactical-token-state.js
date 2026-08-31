import { CoordinateAdapter } from "./coordinate-adapter.js";
import { OrientationAdapter } from "./orientation-adapter.js";
import {
  getTacticalTokenFlags,
  getTokenPitch
} from "./token-flags.js";

function documentData(tokenDocument) {
  const data = tokenDocument?.document ?? tokenDocument;
  if (!data || typeof data !== "object") {
    throw new TypeError("A placed TokenDocument-like object is required");
  }
  return data;
}

function idOf(value) {
  return value?.id ?? value?._id;
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
    orientationAdapter = new OrientationAdapter()
  } = {}) {
    this.coordinateAdapter = coordinateAdapter;
    this.orientationAdapter = orientationAdapter;
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
    const depth = positiveDimension(data.depth);

    return Object.freeze({
      tokenId: idOf(data) ?? idOf(tokenDocument),
      sceneId: idOf(scene),
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
      // Prompt 10 supplies authoritative visibility/permission services.
      visibleToCurrentUser: null,
      canCurrentUserUpdate: null
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
