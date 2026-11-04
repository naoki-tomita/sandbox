// ラック: モジュールのパネルと、それをつなぐケーブル。

import { h } from "zheleznaya";
import { addEffect, moduleOptions, savePresetOf, soundingNotes, toggleModule } from "../actions";
import { canSelectOutput } from "../audio";
import { attachCableLayer, attachRack, onPatchEnd, onPatchMove, onPatchStart } from "../cables";
import { CODE_EXAMPLES } from "../code-examples";
import { selectMic, selectSpeaker } from "../devices";
import { attachMeter, attachPitch } from "../display";
import { noteName } from "../notes";
import { removeModule } from "../patchbay";
import { isMovable, onGripKey, onReorderEnd, onReorderMove, onReorderStart } from "../reorder";
import { onUpdate, state, type Device, type ModuleState } from "../state";
import { Knob } from "./Knob";

const Jack = ({ m, dir }: { m: ModuleState; dir: "in" | "out" }) => (
  <span class="jack-wrap">
    <button class="jack" type="button" data-id={m.id} data-dir={dir} aria-label={`${m.name} ${dir.toUpperCase()}`}></button>
    <span class={`jack-label jack-label--${dir}`}>{dir.toUpperCase()}</span>
  </span>
);

const Knobs = ({ m }: { m: ModuleState }) => <div class="knobs">{m.params.map((p) => <Knob param={p} />)}</div>;

// テキストエリアは描画のたびに中身を差し替えるとカーソルが飛ぶので、作ったときに一度だけ中身を入れ、
// あとは入力のたびに state 側へ写す。
// ただし zheleznaya は要素を位置で使い回すので、並べ替えるとテキストエリアが別のモジュールのものになる
// (https://github.com/naoki-tomita/zheleznaya/issues/30)。どのモジュールのコードを出しているかを覚えておき、
// 描画のあとに別のモジュールのものになっていたら書き直す
const shown = new WeakMap<HTMLTextAreaElement, number>();

function showCode(el: HTMLTextAreaElement, m: ModuleState) {
  el.value = m.code!.source;
  shown.set(el, m.id);
}

// 再描画は zheleznaya が後でまとめて行うので、それが済んでから確かめる
onUpdate(() =>
  setTimeout(() => {
    for (const el of document.querySelectorAll<HTMLTextAreaElement>("textarea.code")) {
      const m = state.modules.find((it) => it.id === Number(el.dataset.id));
      if (m?.code && shown.get(el) !== m.id) showCode(el, m);
    }
  }, 0),
);

const CodeEditor = ({ m }: { m: ModuleState }) => {
  const code = m.code!;
  return (
    <div class="code-screen">
      <textarea
        class="code"
        spellcheck={"false" as unknown as boolean}
        aria-label={`${m.name} のコード`}
        data-id={m.id}
        ref={(el: HTMLTextAreaElement) => showCode(el, m)}
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
          const editor = document.querySelector<HTMLTextAreaElement>(`textarea.code[data-id="${m.id}"]`);
          if (editor) showCode(editor, m);
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

// 鳴らしている音 (トランスポーズ後)
const notesText = () => {
  const notes = soundingNotes().sort((a, b) => a - b);
  return notes.length ? notes.map(noteName).join(" ") : "NOTE —";
};

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

const ModulePanel = ({ m }: { m: ModuleState }) => (
  <section class={`module module--${m.width}${state.draggingId === m.id ? " is-dragging" : ""}`} data-role={m.role} aria-label={m.name}>
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
