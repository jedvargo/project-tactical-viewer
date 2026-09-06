import { SceneEligibilityService } from "../scene-eligibility.js";
import { getSceneEnabled } from "../scene-flags.js";
import { localize } from "../i18n.js";
// Keep the optional editor module in the release dependency graph; token
// configuration itself is intentionally not mounted by this UI service.
import { editAdvancedArtConfiguration } from "./art-editor.js";

// Retain the optional editor in the release dependency graph without exposing
// it through TokenConfig.
void editAdvancedArtConfiguration;

const RENDER_HOOK = "renderApplicationV2";

function documentOf(application, context) {
  return application?.document ?? context?.document;
}

function kindOf(application, document) {
  const name = application?.constructor?.name;
  if (document?.documentName === "Scene" || name === "SceneConfig") return "scene";
  if (application?.isPrototype === true || name === "PrototypeTokenConfig") return "prototype";
  if (document?.documentName === "Token" || name === "TokenConfig") return "token";
  return null;
}

function create(document, tag, attributes = {}, text = "") {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "textContent") element.textContent = value;
    else if (key === "checked" || key === "disabled") element[key] = value;
    else if (key === "value") element.value = value;
    else element.setAttribute?.(key, value);
  }
  if (text) element.textContent = text;
  return element;
}

function formFor(element) {
  return element?.querySelector?.("form") ?? element;
}

function appendField(document, section, labelText, control) {
  const group = create(document, "div", { class: "form-group" });
  group.append(create(document, "label", {}, labelText), create(document, "div", { class: "form-fields" }, ""));
  group.children[1].appendChild(control);
  section.appendChild(group);
  return group;
}

function inputFor(document, type, name, value, extra = {}) {
  return create(document, "input", { type, name, value, ...extra });
}

function booleanInputFor(document, name, value, extra = {}) {
  const createCheckboxInput = globalThis?.foundry?.applications?.fields?.createCheckboxInput;
  if (typeof createCheckboxInput === "function") {
    return createCheckboxInput({ name, value: value === true, ...extra });
  }
  return inputFor(document, "checkbox", name, "true", {
    ...extra,
    "data-dtype": "Boolean",
    checked: value === true
  });
}

function appendSceneConfiguration({ document, form, scene, sceneEligibility }) {
  const result = sceneEligibility.evaluate(scene);
  const section = create(document, "fieldset", { "data-role": "tactical-scene-config" });
  section.appendChild(create(document, "legend", {}, localize("configuration.title", "3D Tactical Viewer")));
  const enabled = booleanInputFor(document, "flags.tactical-3d-viewer.enabled", getSceneEnabled(scene), {
    disabled: !result.eligible
  });
  appendField(document, section, localize(
    "configuration.scene.enable",
    "Enable 3D Tactical Viewer for this Scene"
  ), enabled);
  const message = create(document, "p", { "data-role": "tactical-scene-eligibility" },
    result.eligible
      ? localize("configuration.scene.available", "Square-grid tactical projection is available.")
      : localize(`sceneEligibility.${result.reason.code}`, result.reason.message));
  section.appendChild(message);
  form.appendChild(section);
}

export class ConfigurationUIService {
  constructor({
    hooks,
    sceneEligibilityService = new SceneEligibilityService(),
    filePickerClass,
    dialogInput
  } = {}) {
    this.hooks = hooks;
    this.sceneEligibilityService = sceneEligibilityService;
    this.filePickerClass = filePickerClass;
    this.dialogInput = dialogInput;
    this.started = false;
    this.handler = (application, element, context) => this.handleRender(application, element, context);
  }

  start() {
    if (this.started || typeof this.hooks?.on !== "function") return false;
    this.hooks.on(RENDER_HOOK, this.handler);
    this.started = true;
    return true;
  }

  stop() {
    if (!this.started) return false;
    this.hooks?.off?.(RENDER_HOOK, this.handler);
    this.started = false;
    return true;
  }

  handleRender(application, element, context = {}) {
    const applicationDocument = documentOf(application, context);
    const kind = kindOf(application, applicationDocument);
    if (!kind || !element?.querySelector) return false;
    // Tactical token appearance and participation are derived from the native
    // TokenDocument. Keep this module's configuration surface Scene-only.
    if (kind !== "scene") return false;
    const document = applicationDocument;
    const form = formFor(element);
    if (!form || form.querySelector?.(`[data-role="tactical-${kind}-config"]`)) return false;
    const ownerDocument = element.ownerDocument ?? globalThis?.document;
    if (!ownerDocument?.createElement) return false;
    appendSceneConfiguration({
      document: ownerDocument,
      form,
      scene: document,
      sceneEligibility: this.sceneEligibilityService
    });
    return true;
  }
}

export function registerConfigurationUI(options = {}) {
  const service = new ConfigurationUIService(options);
  service.start();
  return service;
}
