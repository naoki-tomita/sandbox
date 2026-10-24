// 自作コードの保存先 (このブラウザの localStorage)。使えない環境では空として扱う。

const PRESET_KEY = "jc-harmonizer.codePresets";

export function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY)) || {};
  } catch {
    return {};
  }
}

export function savePreset(name, source) {
  const presets = loadPresets();
  presets[name] = source;
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
  } catch {}
}
