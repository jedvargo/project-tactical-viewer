import {
  normalizeHeading,
  normalizePitch,
  orientationVector,
  snapHeading,
  snapPitch
} from "./orientation-math.js";

/**
 * The sole boundary between Foundry's native token rotation and tactical
 * heading. Foundry rotation 0 faces south; positive rotation proceeds
 * clockwise, so tactical heading is rotation + 180 degrees.
 */
export class OrientationAdapter {
  foundryRotationToHeading(rotation) {
    return normalizeHeading(rotation + 180);
  }

  headingToFoundryRotation(heading) {
    return normalizeHeading(heading - 180);
  }

  normalizeHeading(heading) {
    return normalizeHeading(heading);
  }

  snapHeading(heading) {
    return snapHeading(heading);
  }

  normalizePitch(pitch) {
    return normalizePitch(pitch);
  }

  snapPitch(pitch) {
    return snapPitch(pitch);
  }

  orientationVector(heading, pitch) {
    return orientationVector(heading, pitch);
  }
}

export function createOrientationAdapter() {
  return new OrientationAdapter();
}
