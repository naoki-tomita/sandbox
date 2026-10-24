// 自作コードの保存先 (このブラウザの localStorage)。使えない環境では空として扱う。

const PRESET_KEY = "jc-harmonizer.codePresets";

// 名前 -> コード
export type Presets = Record<string, string>;

export function loadPresets(): Presets {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) ?? "null") || {};
  } catch {
    return {};
  }
}

export function savePreset(name: string, source: string) {
  const presets = loadPresets();
  presets[name] = source;
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
  } catch {}
}
