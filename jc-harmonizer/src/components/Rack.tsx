// ラック: モジュールのパネルと、それをつなぐケーブル。

import { h } from "zheleznaya";
import { addEffect, moduleOptions, savePresetOf, toggleModule } from "../actions";
import { canSelectOutput } from "../audio";
import { attachCableLayer, attachRack, onPatchEnd, onPatchMove, onPatchStart } from "../cables";
import { CODE_EXAMPLES } from "../code-examples";
import { selectMic, selectSpeaker } from "../devices";
import { attachMeter, attachPitch } from "../display";
import { noteName } from "../notes";
import { removeModule } from "../patchbay";
import { isMovable, onGripKey, onReorderEnd, onReorderMove, onReorderStart } from "../reorder";
import { state, type Device, type ModuleState } from "../state";
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

// マイク・スピーカーの選択。一覧は POWER を押してマイクを許可したあとに出る
const DeviceSelect = ({ label, devices, value, onselect }: { label: string; devices: Device[]; value: string; onselect: (id: string) => void }) =>
  state.power ? (
    <select class="panel-select device-select" aria-label={label} onchange={(e: Event) => onselect((e.target as HTMLSelectElement).value)}>
      <option value="" selected={value === ""}>
        既定
      </option>
      {devices.map((d) => (
        <option value={d.id} selected={d.id === value}>
          {d.label}
        </option>
      ))}
    </select>
  ) : (
    <span class="device-note">POWER のあとで選べる</span>
  );

const notesText = () => (state.held.size ? [...state.held].sort((a, b) => a - b).map(noteName).join(" ") : "NOTE —");

function moduleBody(m: ModuleState) {
  switch (m.kind) {
    case "mic":
      return [
        <span class="panel-caption">LEVEL</span>,
        <div class="meter" aria-hidden="true" ref={attachMeter}></div>,
        <span class="panel-caption">DEVICE</span>,
        <DeviceSelect label="使うマイク" devices={state.inputs} value={state.micId} onselect={selectMic} />,
      ];
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
        <span class="panel-caption">DEVICE</span>,
        canSelectOutput ? (
          <DeviceSelect label="出力先" devices={state.outputs} value={state.speakerId} onselect={selectSpeaker} />
        ) : (
          <span class="device-note">OS の設定に従う</span>
        ),
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

// モジュールのパネル。要素名をモジュールごとに変えて (jc-module-<id>)、並べ替えや出し入れで
// その位置のモジュールが変わったときは、差分を取らずに丸ごと作り直させる。
// zheleznaya は、子の数が違う兄弟要素を入れ替えると子の追加・削除を別の要素にしてしまうため
// (https://github.com/naoki-tomita/zheleznaya/issues/20)
const ModulePanel = ({ m }: { m: ModuleState }) =>
  h(
    `jc-module-${m.id}`,
    { class: `module module--${m.width}${state.draggingId === m.id ? " is-dragging" : ""}`, role: "region", "data-role": m.role, "aria-label": m.name },
    <header class="module-head">
      {isMovable(m) ? (
        <button class="module-grip" type="button" data-id={m.id} aria-label={`${m.name} を並べ替える (左右の矢印キーでも動かせる)`} title="ドラッグで並べ替え" onkeydown={(e: KeyboardEvent) => onGripKey(e, m)}>
          ⠿
        </button>
      ) : null}
      <h2 class="module-name">{m.name}</h2>
      <span class="module-sub">{m.sub}</span>
      {m.removable ? (
        <button class="module-remove" type="button" onclick={() => removeModule(m)}>
          外す
        </button>
      ) : null}
    </header>,
    <div class="module-body">{moduleBody(m)}</div>,
    <div class="jacks">
      {m.input ? <Jack m={m} dir="in" /> : null}
      {m.output ? <Jack m={m} dir="out" /> : null}
    </div>,
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

// ラック上のポインター操作: ケーブルを引く (ジャック) か、モジュールを並べ替える (つかみ)
const onPointerDown = (e: PointerEvent) => (onReorderStart(e), onPatchStart(e));
const onPointerMove = (e: PointerEvent) => (onReorderMove(e), onPatchMove(e));
const onPointerEnd = (e: PointerEvent) => (onReorderEnd(e), onPatchEnd(e));

export const Rack = () => (
  <div class="rack-wrap" ref={attachRack} onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={onPointerEnd} onpointercancel={onPointerEnd}>
    <main class="rack">
      {state.modules.map((m) => <ModulePanel m={m} />)}
      <AddPanel />
    </main>
    <div class="cables-host" ref={attachCableLayer}></div>
  </div>
);
