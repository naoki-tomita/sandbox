// 画面全体: 上段のレール (名前・MIDI・電源)、説明、ラック、鍵盤。

import { h } from "zheleznaya";
import { powerOn } from "../actions";
import { attachMidiLed } from "../display";
import { state } from "../state";
import { Keyboard } from "./Keyboard";
import { Rack } from "./Rack";

const Header = () => (
  <header class="top">
    <div class="brand">
      <h1>JC HARMONIZER</h1>
      <p>マイクの声を、鍵盤で押した音程で鳴らすボーカルハーモナイザー</p>
    </div>
    <div class="midi">
      <span class="led" ref={attachMidiLed}></span>
      <span>MIDI</span>
      <span>{state.midiName}</span>
    </div>
    <div class="status" role="status">
      {state.status}
    </div>
    <button class="power" type="button" aria-pressed={String(state.power)} onclick={powerOn}>
      <span class="bezel">
        <span class="led"></span>
      </span>
      POWER
    </button>
  </header>
);

export const App = () => (
  <div class="app">
    <Header />
    <p class="hint">
      POWER を押してマイクを許可し、鍵盤か MIDI で音程を指定します。ジャックからドラッグしてケーブルをつなぎ、IN
      ジャックから引き抜いて離すと外れます。ハウリングするのでイヤホン推奨。
    </p>
    <Rack />
    <Keyboard />
  </div>
);
