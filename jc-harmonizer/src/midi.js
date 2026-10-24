// Web MIDI の入力。つながっている全機器のノートオン / オフを受け取る。
// 機器の抜き差しにも追従し、状態は onStatus に文字列で知らせる。

export async function startMidi({ onNoteOn, onNoteOff, onActivity, onStatus }) {
  if (!navigator.requestMIDIAccess) {
    onStatus("Web MIDI 非対応 — 画面の鍵盤で弾いてください");
    return;
  }
  let access;
  try {
    access = await navigator.requestMIDIAccess();
  } catch (e) {
    onStatus(`MIDI を使えません (${e.message})`);
    return;
  }
  const bind = () => {
    const names = [];
    for (const input of access.inputs.values()) {
      names.push(input.name);
      input.onmidimessage = ({ data }) => {
        const [status, note, velocity] = data;
        const cmd = status & 0xf0;
        if (cmd === 0x90 && velocity > 0) onNoteOn(note, velocity);
        else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) onNoteOff(note);
        else return;
        onActivity();
      };
    }
    onStatus(names.join(", ") || "MIDI 機器なし");
  };
  bind();
  access.onstatechange = bind;
}
