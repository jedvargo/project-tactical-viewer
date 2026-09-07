import { MODULE_ID } from "./constants.js";
import { debugTokenUsage } from "./debug.js";

const TOKEN_EVENTS = Object.freeze([
  "moveToken",
  "updateToken",
  "createToken",
  "deleteToken"
]);

const LIFECYCLE_EVENTS = Object.freeze(["ready", "canvasReady", "canvasTearDown", "updateScene"]);

const MOVEMENT_FIELDS = Object.freeze(["x", "y", "elevation"]);
const ROTATION_FIELDS = Object.freeze(["rotation"]);
const APPEARANCE_FIELDS = Object.freeze([
  "texture",
  "width",
  "height",
  "shape",
  "name",
  "displayName",
  "hidden",
  "alpha",
  "detectionModes",
  "sight",
  "occludable",
  "depth"
]);
const MODULE_FLAGS_PREFIX = `flags.${MODULE_ID}`;

function defaultScheduler(callback) {
  if (typeof globalThis?.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(callback, 0);
}

function defaultCancelScheduler(handle) {
  if (typeof globalThis?.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
    return;
  }
  globalThis.clearTimeout(handle);
}

function documentId(document) {
  return document?.id;
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

function changedPaths(changed, prefix = "", paths = []) {
  if (!isObject(changed)) return paths;

  for (const [key, value] of Object.entries(changed)) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(path);
    if (isObject(value) && !Array.isArray(value)) changedPaths(value, path, paths);
  }
  return paths;
}

function pathMatches(path, field) {
  return path === field || path.startsWith(`${field}.`);
}

function hasPath(paths, fields) {
  return fields.some((field) => paths.some((path) => pathMatches(path, field)));
}

function classifyUpdate(changed) {
  const paths = changedPaths(changed);
  const reasons = [];

  if (hasPath(paths, MOVEMENT_FIELDS)) reasons.push("movement");
  if (hasPath(paths, ROTATION_FIELDS)) reasons.push("rotation");
  if (paths.some((path) => pathMatches(path, MODULE_FLAGS_PREFIX))) {
    reasons.push("module-flags");
  }
  if (hasPath(paths, APPEARANCE_FIELDS)) reasons.push("visibility-or-appearance");

  return Object.freeze({ paths: Object.freeze(paths), reasons: Object.freeze(reasons) });
}

function freezeEvent({ tokenIds, deletedTokenIds, createdTokenIds, reasons, changedFields }) {
  return Object.freeze({
    type: "token-invalidation",
    tokenIds: Object.freeze([...tokenIds]),
    deletedTokenIds: Object.freeze([...deletedTokenIds]),
    createdTokenIds: Object.freeze([...createdTokenIds]),
    reasons: Object.freeze([...reasons]),
    changedFields: Object.freeze([...changedFields])
  });
}

/**
 * Bridges authoritative Foundry document hooks to viewer invalidation events.
 * The coordinator only reports that canonical state changed; it never writes
 * to a TokenDocument or reconstructs state from hook payloads.
 */
export class SynchronizationCoordinator {
  constructor({
    hooks,
    scheduler = defaultScheduler,
    cancelScheduler = scheduler?.cancel ?? defaultCancelScheduler
  } = {}) {
    this.hooks = hooks;
    this.scheduler = typeof scheduler === "function" ? scheduler : scheduler?.request;
    this.cancelScheduler = cancelScheduler;
    this.listeners = new Set();
    this.lifecycleListeners = new Set();
    this.started = false;
    this.active = false;
    this.frameScheduled = false;
    this.scheduledHandle = undefined;
    this.pending = undefined;

    this.handlers = Object.freeze({
      moveToken: (document) => this.handleMovement(document),
      updateToken: (document, changed) => this.handleUpdate(document, changed),
      createToken: (document) => this.handleCreation(document),
      deleteToken: (document) => this.handleDeletion(document),
      canvasReady: (canvas) => this.handleCanvasReady(canvas),
      canvasTearDown: (canvas) => this.handleCanvasTearDown(canvas),
      updateScene: (scene, changed) => this.handleSceneUpdate(scene, changed),
      ready: () => this.handleReady()
    });
  }

  get isStarted() {
    return this.started;
  }

  get isActive() {
    return this.active;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Synchronization subscribers must be functions");
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onInvalidation(listener) {
    return this.subscribe(listener);
  }

  subscribeLifecycle(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Synchronization lifecycle subscribers must be functions");
    }
    this.lifecycleListeners.add(listener);
    return () => this.lifecycleListeners.delete(listener);
  }

  onLifecycle(listener) {
    return this.subscribeLifecycle(listener);
  }

  start() {
    if (this.started) return false;
    if (typeof this.hooks?.on !== "function") return false;
    if (typeof this.hooks?.off !== "function") {
      throw new TypeError("Foundry Hooks must provide both on and off methods");
    }

    this.started = true;
    for (const event of LIFECYCLE_EVENTS) this.hooks.on(event, this.handlers[event]);
    this.activate();
    return true;
  }

  activate() {
    if (!this.started || this.active) return false;
    this.active = true;
    for (const event of TOKEN_EVENTS) this.hooks.on(event, this.handlers[event]);
    return true;
  }

  deactivate() {
    if (!this.active) return false;
    for (const event of TOKEN_EVENTS) this.hooks.off(event, this.handlers[event]);
    this.active = false;
    this.cancelPending();
    return true;
  }

  /** Stop hook delivery while retaining subscribers for a later restart. */
  teardown() {
    if (!this.started) return false;
    this.deactivate();
    for (const event of LIFECYCLE_EVENTS) this.hooks.off(event, this.handlers[event]);
    this.started = false;
    return true;
  }

  stop() {
    return this.teardown();
  }

  handleMovement(document) {
    debugTokenUsage("hook-moveToken", {
      tokenId: documentId(document),
      tokenName: document?.name ?? ""
    });
    this.enqueue(document, ["movement"], MOVEMENT_FIELDS);
  }

  handleUpdate(document, changed) {
    const update = classifyUpdate(changed);
    debugTokenUsage("hook-updateToken", {
      tokenId: documentId(document),
      tokenName: document?.name ?? "",
      changedFields: update.paths,
      reasons: update.reasons
    });
    if (update.reasons.length === 0) return false;
    this.enqueue(document, update.reasons, update.paths);
    return true;
  }

  handleCreation(document) {
    debugTokenUsage("hook-createToken", {
      tokenId: documentId(document),
      tokenName: document?.name ?? ""
    });
    this.enqueue(document, ["creation"], [] , { created: true });
  }

  handleDeletion(document) {
    debugTokenUsage("hook-deleteToken", {
      tokenId: documentId(document),
      tokenName: document?.name ?? ""
    });
    this.enqueue(document, ["deletion"], [], { deleted: true });
  }

  handleCanvasReady(canvas) {
    this.activate();
    this.emitLifecycle({ type: "canvas-ready", canvas, scene: canvas?.scene ?? canvas });
  }

  handleReady() {
    this.activate();
    this.emitLifecycle({ type: "ready" });
  }

  handleCanvasTearDown(canvas) {
    this.deactivate();
    this.emitLifecycle({ type: "canvas-teardown", canvas, scene: canvas?.scene ?? canvas });
  }

  handleSceneUpdate(scene, changed) {
    this.emitLifecycle({ type: "scene-update", scene, changed });
  }

  emitLifecycle(event) {
    for (const listener of this.lifecycleListeners) listener(event);
  }

  enqueue(document, reasons, fields, { created = false, deleted = false } = {}) {
    if (!this.active) return false;
    const id = documentId(document);
    if (id === undefined || id === null) return false;

    if (!this.pending) {
      this.pending = {
        tokenIds: new Set(),
        deletedTokenIds: new Set(),
        createdTokenIds: new Set(),
        reasons: new Set(),
        changedFields: new Set()
      };
    }

    this.pending.tokenIds.add(id);
    if (deleted) this.pending.deletedTokenIds.add(id);
    if (created) this.pending.createdTokenIds.add(id);
    reasons.forEach((reason) => this.pending.reasons.add(reason));
    fields.forEach((field) => this.pending.changedFields.add(field));

    if (!this.frameScheduled) {
      if (typeof this.scheduler !== "function") {
        throw new TypeError("A requestAnimationFrame-style scheduler is required");
      }
      this.frameScheduled = true;
      this.scheduledHandle = this.scheduler(() => this.flush());
    }
    return true;
  }

  cancelPending() {
    if (this.frameScheduled && this.scheduledHandle !== undefined) {
      this.cancelScheduler?.(this.scheduledHandle);
    }
    this.frameScheduled = false;
    this.scheduledHandle = undefined;
    this.pending = undefined;
  }

  flush() {
    this.frameScheduled = false;
    this.scheduledHandle = undefined;
    const pending = this.pending;
    this.pending = undefined;
    if (!pending || !this.active) return false;

    const event = freezeEvent({
      tokenIds: pending.tokenIds,
      deletedTokenIds: pending.deletedTokenIds,
      createdTokenIds: pending.createdTokenIds,
      reasons: pending.reasons,
      changedFields: pending.changedFields
    });
    for (const listener of this.listeners) listener(event);
    return true;
  }
}

export { classifyUpdate };
