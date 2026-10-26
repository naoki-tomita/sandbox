// ラック: モジュールのパネルと、それをつなぐケーブル。

import { h } from "zheleznaya";
import { addEffect, moduleOptions, savePresetOf, toggleModule } from "../actions";
import { attachCableLayer, attachRack, onPatchEnd, onPatchMove, onPatchStart } from "../cables";
import { CODE_EXAMPLES } from "../code-examples";
import { attachMeter, attachPitch } from "../display";
import { noteName } from "../notes";
import { removeModule } from "../patchbay";
import { state, type ModuleState } from "../state";
import { Knob } from "./Knob";

const Jack = ({ m, dir }: { m: ModuleState; dir: "in" | "out" }) => (
  <span class="jack-wrap">
    <button class="jack" type="button" data-id={m.id} data-dir={dir} aria-label={`${m.name} ${dir.toUpperCase()}`}></button>
    <span class={`jack-label jack-label--${dir}`}>{dir.toUpperCase()}</span>
  </span>
);

const Knobs = ({ m }: { m: ModuleState }) => <div class="knobs">{m.params.map((p) => <Knob param={p} />)}</div>;

// テキストエリアは描画のたびに中身を差し替えるとカーソルが飛ぶので、作ったときに一度だけ中身を入れ、
// あとは入力のたびに state 側へ写す
const editors = new Map<number, HTMLTextAreaElement>();

const CodeEditor = ({ m }: { m: ModuleState }) => {
  const code = m.code!;
  return (
    <div class="code-screen">
      <textarea
        class="code"
        spellcheck={"false" as unknown as boolean}
        aria-label={`${m.name} のコード`}
        ref={(el: HTMLTextAreaElement) => {
          editors.set(m.id, el);
          el.value = code.source;
        }}
        oninput={(e: Event) => (code.source = (e.target as HTMLTextAreaElement).value)}
      ></textarea>
      <div class={code.isError ? "code-result is-error" : "code-result"} role="status">
        {code.result}
      </div>
    </div>
  );
};

const CodeTools = ({ m }: { m: ModuleState }) => (
  <div class="code-tools">
    <button class="key" type="button" onclick={() => m.code!.apply(m.code!.source)}>
      適用
    </button>
    <button class="key" type="button" onclick={() => savePresetOf(m)}>
      保存
    </button>
    <select
      class="panel-select"
      aria-label="コード例"
      onchange={(e: Event) => {
        const select = e.target as HTMLSelectElement;
        if (select.value) {
          m.code!.source = CODE_EXAMPLES[select.value];
          const editor = editors.get(m.id);
          if (editor) editor.value = m.code!.source;
        }
        select.value = "";
      }}
    >
      <option value="">例を読み込む…</option>
      {Object.keys(CODE_EXAMPLES).map((k) => <option value={k}>{k}</option>)}
    </select>
  </div>
);

const notesText = () => (state.held.size ? [...state.held].sort((a, b) => a - b).map(noteName).join(" ") : "NOTE —");

function moduleBody(m: ModuleState) {
  switch (m.kind) {
    case "mic":
      return [<span class="panel-caption">LEVEL</span>, <div class="meter" aria-hidden="true" ref={attachMeter}></div>];
    case "voice":
      return [
        <div class="lcd">
          <div class="lcd-row" ref={attachPitch}></div>
          <div class="lcd-row">{notesText()}</div>
        </div>,
        <Knobs m={m} />,
      ];
    case "output":
      return [
        <Knob param={m.params[0]} />,
        <span class="panel-caption">LATENCY</span>,
        <div class="lcd">
          <div class="lcd-row">{state.latency}</div>
        </div>,
      ];
    case "fx":
      return [
        <button class="switch" type="button" aria-pressed={String(m.on)} onclick={() => toggleModule(m)}>
          <span class="led"></span>ON
        </button>,
        <Knobs m={m} />,
        m.code ? <CodeEditor m={m} /> : null,
        m.code ? <CodeTools m={m} /> : null,
      ];
  }
}

const ModulePanel = ({ m }: { m: ModuleState }) => (
  <section class={`module module--${m.width}`} data-role={m.role} aria-label={m.name}>
    <header class="module-head">
      <h2 class="module-name">{m.name}</h2>
      <span class="module-sub">{m.sub}</span>
      {m.removable ? (
        <button class="module-remove" type="button" onclick={() => removeModule(m)}>
          外す
        </button>
      ) : null}
    </header>
    <div class="module-body">{moduleBody(m)}</div>
    <div class="jacks">
      {m.input ? <Jack m={m} dir="in" /> : null}
      {m.output ? <Jack m={m} dir="out" /> : null}
    </div>
  </section>
);

const AddPanel = () => (
  <section class="add-panel" aria-label="モジュールを追加">
    <h2>ADD MODULE</h2>
    <select class="panel-select" aria-label="追加するモジュール" onchange={(e: Event) => (state.addChoice = (e.target as HTMLSelectElement).value)}>
      {moduleOptions().map((o) => (
        <option value={o.value} selected={o.value === state.addChoice}>
          {o.label}
        </option>
      ))}
    </select>
    <button class="key" type="button" onclick={() => addEffect(state.addChoice)}>
      追加
    </button>
    <span>出力の手前に差し込みます</span>
  </section>
);

export const Rack = () => (
  <div class="rack-wrap" ref={attachRack} onpointerdown={onPatchStart} onpointermove={onPatchMove} onpointerup={onPatchEnd} onpointercancel={onPatchEnd}>
    <main class="rack">
      {state.modules.map((m) => <ModulePanel m={m} />)}
      <AddPanel />
    </main>
    <div class="cables-host" ref={attachCableLayer}></div>
  </div>
);
