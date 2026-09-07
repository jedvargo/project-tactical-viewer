import { MODULE_ID, VIEW_DEFINITIONS } from "../constants.js";
import { getTokenArt } from "../model/token-flags.js";
import { serializeTokenConfiguration } from "./configuration-controller.js";
import { localize, viewLabel } from "../i18n.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function field(name) {
  return `flags.${MODULE_ID}.${name}`;
}

function viewInput(id, value) {
  const name = field(`art.views.${id}`);
  return `<div class="form-group"><label>${escapeHtml(viewLabel(id, id))}</label><div class="form-fields"><input type="text" name="${name}" value="${escapeHtml(value)}"><button type="button" data-role="file-picker" data-field="${name}">${escapeHtml(localize("configuration.token.choose", "Choose"))}</button></div></div>`;
}

export function buildAdvancedArtEditorContent(art = {}) {
  const normalized = getTokenArt({ flags: { [MODULE_ID]: { art } } });
  const northSouth = normalized.mirror.northSouth ? " checked" : "";
  const eastWest = normalized.mirror.eastWest ? " checked" : "";
  return `<div data-role="tactical-art-editor"><p>${escapeHtml(localize("configuration.art.description", "Optional artwork for each fixed tactical view. The orientation vector remains authoritative."))}</p><div class="form-group"><label>${escapeHtml(localize("configuration.art.forwardReference", "Forward reference (degrees)"))}</label><div class="form-fields"><input type="number" name="${field("art.forwardOffset")}" value="${escapeHtml(normalized.forwardOffset)}" step="1"></div></div><div class="form-group"><label>${escapeHtml(localize("configuration.art.mirrorFrontBack", "Mirror Front/Back"))}</label><div class="form-fields"><input type="checkbox" name="${field("art.mirror.northSouth")}" value="on"${northSouth}></div></div><div class="form-group"><label>${escapeHtml(localize("configuration.art.mirrorLeftRight", "Mirror Left/Right"))}</label><div class="form-fields"><input type="checkbox" name="${field("art.mirror.eastWest")}" value="on"${eastWest}></div></div>${VIEW_DEFINITIONS.map(({ id }) => viewInput(id, normalized.views[id])).join("")}</div>`;
}

export function applyFilePickerResult(input, result) {
  const path = typeof result === "string" ? result : result?.path;
  if (typeof path !== "string") return input?.value ?? "";
  if (input && typeof input === "object") input.value = path;
  return path;
}

function defaultDialogInput() {
  return globalThis?.foundry?.applications?.api?.DialogV2?.input;
}

function defaultFilePickerClass() {
  return globalThis?.foundry?.applications?.apps?.FilePicker
    ?? globalThis?.FilePicker;
}

function attachFilePickers(root, filePickerClass) {
  if (!root?.querySelectorAll) return;
  for (const button of root.querySelectorAll('[data-role="file-picker"]')) {
    button.addEventListener("click", async () => {
      const name = button.dataset.field;
      const input = root.querySelector(`[name="${name}"]`);
      if (!input || typeof filePickerClass !== "function") return;
      const picker = new filePickerClass({
        type: "image",
        current: input.value,
        callback: (path) => applyFilePickerResult(input, path)
      });
      await picker.render?.(true);
    });
  }
}

export async function editAdvancedArtConfiguration({
  art,
  dialogInput = defaultDialogInput(),
  filePickerClass = defaultFilePickerClass()
} = {}) {
  if (typeof dialogInput !== "function") return null;
  const result = await dialogInput({
    window: { title: localize("configuration.token.advancedArt", "Advanced Tactical Art") },
    content: buildAdvancedArtEditorContent(art),
    ok: { label: localize("configuration.art.save", "Save") },
    render: (_event, dialog) => attachFilePickers(dialog?.element, filePickerClass)
  });
  if (!result) return null;
  const northSouthField = field("art.mirror.northSouth");
  const eastWestField = field("art.mirror.eastWest");
  return serializeTokenConfiguration({
    get(name) {
      const value = result?.get?.(name);
      if (value !== undefined && value !== null) return value;
      const direct = result?.[name];
      if (direct !== undefined && direct !== null) return direct;
      if (name === northSouthField || name === eastWestField) return false;
      return null;
    }
  }, { fallbackArt: art }).art;
}

export function attachFilePickerToInput({ input, filePickerClass = defaultFilePickerClass() } = {}) {
  if (!input || typeof filePickerClass !== "function") return false;
  const picker = new filePickerClass({
    type: "image",
    current: input.value,
    callback: (path) => applyFilePickerResult(input, path)
  });
  picker.render?.(true);
  return true;
}
