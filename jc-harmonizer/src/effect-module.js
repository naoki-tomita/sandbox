// エフェクトをラックのモジュールとして組み立てる (ON/OFF スイッチ、ノブ、コード欄)。

import { el, button } from "./dom.js";
import { knob } from "./widgets.js";
import { EFFECTS } from "./effects.js";
import { CODE_EXAMPLES } from "./code-examples.js";
import { loadPresets, savePreset } from "./presets.js";

// ADD MODULE の選択肢: 内蔵エフェクトと、保存した自作コード
export function moduleOptions() {
  const options = Object.entries(EFFECTS).map(([key, def]) => new Option(`${def.name} — ${def.label}`, key));
  for (const name of Object.keys(loadPresets())) options.push(new Option(`CODE: ${name}`, `preset:${name}`));
  return options;
}

// エフェクトを ON/OFF できるように in/out のゲインで包む (OFF のときは素通し)
function bypassable(ctx, fx) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  let on = true;
  const route = () => {
    input.disconnect();
    fx.output.disconnect();
    if (on) {
      input.connect(fx.input);
      fx.output.connect(output);
    } else {
      input.connect(output);
    }
  };
  route();
  return { input, output, setOn: (v) => ((on = v), route()) };
}

// value は moduleOptions() の値。作ったモジュールは outputModule の手前に差し込む。
export function addEffectModule({ ctx, rack, value, outputModule, onPresetSaved }) {
  let type = value, opts = {}, title;
  if (value.startsWith("preset:")) {
    title = value.slice(7);
    type = "code";
    opts = { source: loadPresets()[title] };
  }
  const def = EFFECTS[type];
  const fx = def.create(ctx, opts);
  const io = bypassable(ctx, fx);
  const m = rack.makeModule({
    name: title || def.name,
    sub: def.label,
    role: "fx",
    width: fx.code ? "wide" : "normal",
    input: io.input,
    output: io.output,
    removable: true,
    before: outputModule.el,
  });
  m.onRemove = () => {
    io.input.disconnect();
    fx.output.disconnect();
    fx.dispose();
  };

  const power = button("switch", "ON", null);
  power.setAttribute("aria-pressed", "true");
  power.prepend(el("span", "led"));
  power.onclick = () => {
    const on = power.getAttribute("aria-pressed") !== "true";
    power.setAttribute("aria-pressed", String(on));
    io.setOn(on);
  };
  m.body.append(power);

  const knobs = el("div", "knobs");
  for (const p of fx.params) knobs.append(knob(p));
  m.body.append(knobs);

  if (fx.code) {
    const screen = el("div", "code-screen");
    const editor = Object.assign(el("textarea", "code"), { value: fx.code.source, spellcheck: false });
    editor.setAttribute("aria-label", `${m.name} のコード`);
    const result = el("div", "code-result", "");
    result.setAttribute("role", "status");
    fx.code.onResult = (error) => {
      result.classList.toggle("is-error", !!error);
      result.textContent = error ? `ERR 素通し中: ${error}` : "OK 適用しました";
    };
    screen.append(editor, result);

    const examples = el("select", "panel-select");
    examples.setAttribute("aria-label", "コード例");
    examples.append(new Option("例を読み込む…", ""), ...Object.keys(CODE_EXAMPLES).map((k) => new Option(k, k)));
    examples.onchange = () => {
      if (examples.value) editor.value = CODE_EXAMPLES[examples.value];
      examples.value = "";
    };
    const save = () => {
      const name = prompt("保存する名前", title || "");
      if (!name) return;
      savePreset(name, editor.value);
      title = name;
      m.el.querySelector(".module-name").textContent = name;
      onPresetSaved();
    };
    const tools = el("div", "code-tools");
    tools.append(button("key", "適用", () => fx.code.apply(editor.value)), button("key", "保存", save), examples);
    m.body.append(screen, tools);
  }

  rack.insertBefore(m, outputModule);
  rack.redraw();
  return m;
}
