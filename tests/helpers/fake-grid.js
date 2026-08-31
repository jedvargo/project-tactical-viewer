/**
 * Small square-grid fake with the public v14 point/offset methods used by the
 * CoordinateAdapter. Its non-zero origin represents Scene padding/offset.
 */
export function createFakeSquareGrid({
  originX = 0,
  originY = 0,
  size = 100,
  distance = 5,
  type = "square"
} = {}) {
  const calls = {
    getOffset: [],
    getCenterPoint: [],
    getTopLeftPoint: [],
    getSnappedPoint: []
  };

  const grid = {
    type,
    size,
    sizeX: size,
    sizeY: size,
    distance,
    calls,

    getOffset(coords) {
      calls.getOffset.push(coords);
      return {
        i: Math.floor((coords.x - originX) / size),
        j: Math.floor((coords.y - originY) / size)
      };
    },

    getCenterPoint(coords) {
      calls.getCenterPoint.push(coords);
      return {
        x: originX + (coords.i + 0.5) * size,
        y: originY + (coords.j + 0.5) * size
      };
    },

    getTopLeftPoint(coords) {
      calls.getTopLeftPoint.push(coords);
      return {
        x: originX + coords.i * size,
        y: originY + coords.j * size
      };
    },

    getSnappedPoint(point, behavior) {
      calls.getSnappedPoint.push({ point, behavior });
      return {
        x: originX + Math.round((point.x - originX) / size) * size,
        y: originY + Math.round((point.y - originY) / size) * size
      };
    }
  };

  return grid;
}

export function makeSquareScene(grid) {
  return {
    grid,
    dimensions: { width: 1200, height: 1000 }
  };
}

export function makeToken({
  x,
  y,
  width = 1,
  height = 1,
  id = "token"
}) {
  return { id, x, y, width, height };
}
