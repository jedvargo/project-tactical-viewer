function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function textEditorImplementation() {
  // Foundry v14 moved TextEditor behind the applications namespace. Keep the
  // legacy global as the final fallback for older supported installations;
  // reading it only after the v14 path avoids Foundry's compatibility warning.
  return globalThis?.foundry?.applications?.ux?.TextEditor?.implementation
    ?? globalThis?.foundry?.applications?.ux?.TextEditor
    ?? globalThis?.CONFIG?.ux?.TextEditor
    ?? globalThis?.TextEditor;
}

function fromUuidImplementation() {
  return globalThis?.foundry?.utils?.fromUuid
    ?? globalThis?.fromUuid;
}

function uuidPart(uuid, documentName) {
  if (typeof uuid !== "string" || !uuid) return null;
  const parts = uuid.split(".");
  const index = parts.indexOf(documentName);
  return index >= 0 ? parts[index + 1] ?? null : null;
}

/** Read the same serialized payload used by Foundry sidebar drag sources. */
export function getViewerDropData(event) {
  try {
    const parsed = textEditorImplementation()?.getDragEventData?.(event);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Fall through to the standard DataTransfer text payload.
  }

  const transfer = event?.dataTransfer;
  for (const type of ["application/json", "text/plain", "text/uri-list"]) {
    const raw = transfer?.getData?.(type);
    const parsed = parseJson(raw);
    if (parsed) return parsed;
    if (type !== "text/plain" && type !== "text/uri-list") continue;
    const source = typeof raw === "string"
      ? raw.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("#"))
      : "";
    if (/^(?:https?:|data:|\/|[^\s]+\.(?:png|jpe?g|gif|webp|svg)(?:\?.*)?)$/i.test(source ?? "")) {
      return { type: "Image", src: source };
    }
  }
  return null;
}

export function panelIndexForDropTarget(target) {
  let current = target;
  while (current) {
    const value = current.dataset?.panelIndex;
    if (value !== undefined && Number.isInteger(Number(value))) return Number(value);
    current = current.parentElement;
  }
  return -1;
}

export function localDropPoint(event, canvas) {
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect || !Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return null;
  return {
    x: event.clientX - Number(rect.left || 0),
    y: event.clientY - Number(rect.top || 0)
  };
}

function collectionDocument(collection, id) {
  if (!id || !collection) return null;
  if (typeof collection.get === "function") return collection.get(id) ?? null;
  if (isRecord(collection)) return collection[id] ?? null;
  return null;
}

/** Resolve a dropped document without trusting arbitrary data as a token. */
export async function resolveDroppedDocument(data, {
  fromUuid = fromUuidImplementation(),
  game = globalThis?.game
} = {}) {
  if (!isRecord(data)) return null;
  const uuid = data.uuid;
  if (typeof fromUuid === "function" && typeof uuid === "string" && uuid) {
    try {
      const resolved = await fromUuid(uuid);
      if (resolved) return resolved;
    } catch {
      // A stale UUID can still have a usable collection ID fallback.
    }
  }

  const type = String(data.type ?? data.documentName ?? "").toLowerCase();
  if (type === "actor") {
    const actorId = data.id ?? data.actorId ?? uuidPart(uuid, "Actor");
    return collectionDocument(game?.actors, actorId);
  }
  if (type === "token") {
    const sceneId = data.sceneId ?? uuidPart(uuid, "Scene");
    const tokenId = data.id ?? data.tokenId ?? uuidPart(uuid, "Token");
    const scene = collectionDocument(game?.scenes, sceneId);
    if (!scene || !tokenId) return null;
    return scene.getEmbeddedDocument?.("Token", tokenId)
      ?? scene.tokens?.get?.(tokenId)
      ?? null;
  }
  return null;
}

function plainDocument(document) {
  const value = document?.toObject?.() ?? document;
  if (!isRecord(value)) return null;
  const clone = { ...value };
  delete clone["_id"];
  delete clone.id;
  return clone;
}

/** Build token creation data from a standard Actor/Token drop or image data. */
export async function tokenDataForDrop(data, options = {}) {
  if (!isRecord(data)) return null;

  const type = String(data.type ?? data.documentName ?? "").toLowerCase();

  if (type === "actor") {
    const actor = await resolveDroppedDocument(data, options);
    if (!actor) return null;
    if (typeof actor.getTokenDocument === "function") {
      const token = await actor.getTokenDocument({ x: 0, y: 0, elevation: 0 });
      return plainDocument(token);
    }
    const prototype = plainDocument(actor.prototypeToken);
    if (!prototype) return null;
    return { ...prototype, actorId: actor.id ?? data.id };
  }

  if (type === "token") {
    return plainDocument(await resolveDroppedDocument(data, options));
  }

  if (data.type && !["Image", "image", "Tile"].includes(data.type)) return null;
  const source = data.src ?? data.img ?? data.texture?.src;
  if (typeof source === "string" && source.trim()) {
    const width = Number.isInteger(data.width) && data.width >= 1 && data.width <= 20
      ? data.width
      : 1;
    const height = Number.isInteger(data.height) && data.height >= 1 && data.height <= 20
      ? data.height
      : 1;
    return {
      name: data.name ?? "Tactical Token",
      x: 0,
      y: 0,
      elevation: 0,
      width,
      height,
      texture: { src: source.trim() }
    };
  }
  return null;
}
