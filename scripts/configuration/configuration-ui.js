import { ALLOWED_PITCHES, CURRENT_SCHEMA_VERSION, VIEW_DEFINITIONS } from "../constants.js";
import { getTokenArt, getTokenParticipation, getTokenPitch } from "../model/token-flags.js";
import { OrientationAdapter } from "../model/orientation-adapter.js";
import { SceneEligibilityService } from "../scene-eligibility.js";
import { getSceneEnabled } from "../scene-flags.js";
import { editAdvancedArtConfiguration } from "./art-editor.js";
import { applyFilePickerResult } from "./art-editor.js";
import { serializeTokenConfiguration } from "./configuration-controller.js";

const RENDER_HOOK = "renderApplicationV2";

function documentOf(application, context) {
  return application?.document ?? context?.document;
}

function configurationDocument(application, kind, context) {
  const document = documentOf(application, context);
  if (kind !== "prototype") return document;
  // PrototypeTokenConfig exposes the configured PrototypeToken through its
  // documented `token` accessor; the owning Actor is not the flag target.
  return application?.token ?? application?.document?.prototypeToken ?? document;
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

function namedValue(root, name) {
  return root?.querySelector?.(`[name="${name}"]`);
}

function appendSceneConfiguration({ document, form, scene, sceneEligibility }) {
  const result = sceneEligibility.evaluate(scene);
  const section = create(document, "fieldset", { "data-role": "tactical-scene-config" });
  section.appendChild(create(document, "legend", {}, "3D Tactical Viewer"));
  const enabled = inputFor(document, "checkbox", "flags.tactical-3d-viewer.enabled", "true", {
    checked: getSceneEnabled(scene),
    disabled: !result.eligible
  });
  appendField(document, section, "Enable 3D Tactical Viewer for this Scene", enabled);
  const message = create(document, "p", { "data-role": "tactical-scene-eligibility" },
    result.eligible ? "Square-grid tactical projection is available." : result.reason.message);
  section.appendChild(message);
  form.appendChild(section);
}

function addHiddenArtFields(document, section, art) {
  section.appendChild(inputFor(document, "hidden", "flags.tactical-3d-viewer.schemaVersion", CURRENT_SCHEMA_VERSION));
  for (const { id } of VIEW_DEFINITIONS) {
    section.appendChild(inputFor(document, "hidden", `flags.tactical-3d-viewer.art.views.${id}`, art.views[id]));
  }
  section.appendChild(inputFor(document, "hidden", "flags.tactical-3d-viewer.art.forwardOffset", art.forwardOffset));
  section.appendChild(inputFor(document, "hidden", "flags.tactical-3d-viewer.art.mirror.northSouth", art.mirror.northSouth ? "on" : ""));
  section.appendChild(inputFor(document, "hidden", "flags.tactical-3d-viewer.art.mirror.eastWest", art.mirror.eastWest ? "on" : ""));
}

function appendTokenConfiguration({ document, form, token, kind, filePickerClass, dialogInput }) {
  const art = getTokenArt(token);
  const orientationAdapter = new OrientationAdapter();
  const section = create(document, "fieldset", {
    "data-role": "tactical-token-config",
    "data-token-kind": kind
  });
  section.appendChild(create(document, "legend", {}, "3D Tactical Viewer"));
  appendField(document, section, "Participate in 3D Tactical Viewer", inputFor(
    document, "checkbox", "flags.tactical-3d-viewer.enabled", "true", {
      checked: getTokenParticipation(token)
    }
  ));

  const pitch = create(document, "select", { name: "flags.tactical-3d-viewer.pitch" });
  for (const value of ALLOWED_PITCHES) {
    const option = create(document, "option", { value }, `${value > 0 ? "+" : ""}${value}°`);
    pitch.appendChild(option);
  }
  pitch.value = String(orientationAdapter.snapPitch(getTokenPitch(token)));
  appendField(document, section, "Pitch", pitch);

  const preset = create(document, "select", { name: "flags.tactical-3d-viewer.art.preset" });
  for (const [value, label] of [["generic-ship", "Generic Ship"], ["generic-object", "Generic Object"], ["generic-creature", "Generic Creature"], ["generic-marker", "Generic Marker"]]) {
    preset.appendChild(create(document, "option", { value }, label));
  }
  preset.value = art.preset;
  appendField(document, section, "Generic art preset", preset);

  const icon = inputFor(document, "text", "flags.tactical-3d-viewer.art.icon", art.icon);
  const iconGroup = appendField(document, section, "Primary custom tactical icon", icon);
  const choose = create(document, "button", { type: "button", "data-role": "choose-primary-art" }, "Choose");
  iconGroup.children[1].appendChild(choose);
  choose.addEventListener("click", () => {
    const Picker = filePickerClass
      ?? globalThis?.foundry?.applications?.apps?.FilePicker
      ?? globalThis?.FilePicker;
    if (typeof Picker !== "function") return;
    const picker = new Picker({ type: "image", current: icon.value, callback: (path) => applyFilePickerResult(icon, path) });
    picker.render?.(true);
  });

  addHiddenArtFields(document, section, art);
  const advanced = create(document, "button", { type: "button", "data-role": "configure-advanced-art" }, "Configure advanced view art…");
  section.appendChild(advanced);
  advanced.addEventListener("click", async () => {
    const currentArt = serializeTokenConfiguration(section, { fallbackArt: art }).art;
    const result = await editAdvancedArtConfiguration({ art: currentArt, dialogInput, filePickerClass });
    if (!result) return;
    for (const [name, value] of [
      ["flags.tactical-3d-viewer.art.forwardOffset", result.forwardOffset],
      ["flags.tactical-3d-viewer.art.mirror.northSouth", result.mirror.northSouth ? "on" : ""],
      ["flags.tactical-3d-viewer.art.mirror.eastWest", result.mirror.eastWest ? "on" : ""]
    ]) namedValue(section, name).value = value;
    for (const { id } of VIEW_DEFINITIONS) {
      namedValue(section, `flags.tactical-3d-viewer.art.views.${id}`).value = result.views[id];
    }
  });
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
    const document = configurationDocument(application, kind, context);
    const form = formFor(element);
    if (!form || form.querySelector?.(`[data-role="tactical-${kind}-config"]`)) return false;
    const ownerDocument = element.ownerDocument ?? globalThis?.document;
    if (!ownerDocument?.createElement) return false;
    if (kind === "scene") {
      appendSceneConfiguration({
        document: ownerDocument,
        form,
        scene: document,
        sceneEligibility: this.sceneEligibilityService
      });
    } else {
      appendTokenConfiguration({
        document: ownerDocument,
        form,
        token: document,
        kind,
        filePickerClass: this.filePickerClass,
        dialogInput: this.dialogInput
      });
    }
    return true;
  }
}

export function registerConfigurationUI(options = {}) {
  const service = new ConfigurationUIService(options);
  service.start();
  return service;
}
