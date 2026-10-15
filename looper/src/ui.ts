// DOM への出力に徹する純粋な描画関数群（状態は main.ts が保持する）。

import type { EngineStatus, TrackMeta } from './types';

export interface TrackHandlers {
  onRec: (id: number) => void;
  onMute: (id: number) => void;
  onDelete: (id: number) => void;
}

/** トラック行を再構築する（トラック集合・ミュート・録音状態が変わった時だけ呼ぶ）。 */
export function renderTracks(
  container: HTMLElement,
  tracks: TrackMeta[],
  status: EngineStatus,
  handlers: TrackHandlers,
): void {
  container.textContent = '';

  if (tracks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'トラックがありません。「＋ Add Track」で追加してください。';
    container.appendChild(empty);
    return;
  }

  for (const t of tracks) {
    const armed = status.armedId === t.id;
    const recordingElsewhere = status.recording && !armed;

    const row = document.createElement('div');
    row.className =
      'track' + (armed ? ' armed' : '') + (t.muted ? ' is-muted' : '');

    const name = document.createElement('div');
    name.className = 'track-name';
    name.textContent = t.name;
    row.appendChild(name);

    const rec = button(armed ? '■ Stop' : '● Rec', 'rec' + (armed ? ' active' : ''));
    rec.disabled = recordingElsewhere;
    rec.title = armed ? '録音を停止' : '上書き録音（古い録音は消えます）';
    rec.addEventListener('click', () => handlers.onRec(t.id));
    row.appendChild(rec);

    const mute = button(t.muted ? 'Muted' : 'Mute', 'mute' + (t.muted ? ' active' : ''));
    mute.addEventListener('click', () => handlers.onMute(t.id));
    row.appendChild(mute);

    const del = button('🗑', 'del');
    del.disabled = status.recording;
    del.title = 'トラックを削除';
    del.addEventListener('click', () => handlers.onDelete(t.id));
    row.appendChild(del);

    container.appendChild(row);
  }
}

export interface TransportEls {
  playBtn: HTMLButtonElement;
  addBtn: HTMLButtonElement;
  level: HTMLElement;
  playhead: HTMLElement;
  statusText: HTMLElement;
  warn: HTMLElement;
}

/** 動的な表示（再生ボタン・入力レベル・再生ヘッド・状態文言）を毎ティック更新する。
 *
 * 注意: `textContent` への代入は毎回テキストノードを差し替える。毎ティック無条件に
 * 書き換えると、ボタン文字の上で mousedown → 次ティックでノード差し替え → mouseup と
 * なった際に click が発火せず「フチは押せるが文字の上は反応しない」現象が起きる。
 * そのため文言・disabled は「変化した時だけ」書き込む。 */
export function updateTransport(els: TransportEls, status: EngineStatus): void {
  setText(els.playBtn, status.playing ? '⏸ Stop' : '▶ Play');
  setDisabled(els.playBtn, status.loopLen === 0);
  setDisabled(els.addBtn, status.recording);

  els.level.style.width = `${Math.min(1, status.inputLevel) * 100}%`;

  const frac = status.loopLen > 0 ? status.playhead / status.loopLen : 0;
  els.playhead.style.width = `${frac * 100}%`;

  const parts: string[] = [];
  if (status.loopLen > 0 && status.sampleRate > 0) {
    parts.push(`Loop ${(status.loopLen / status.sampleRate).toFixed(2)}s`);
  } else {
    parts.push('Loop 未設定');
  }
  if (status.recording) parts.push('● REC');
  if (status.sampleRate > 0) parts.push(`${(status.sampleRate / 1000).toFixed(1)}kHz`);
  setText(els.statusText, parts.join('  ·  '));

  setText(
    els.warn,
    status.audioOk ? '' : '⚠ 音声デバイスを初期化できませんでした。マイク／スピーカーを確認してください。',
  );
}

/** 値が変わった時だけ textContent を書き込む（テキストノードの不要な差し替えを避ける）。 */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function setDisabled(el: HTMLButtonElement, disabled: boolean): void {
  if (el.disabled !== disabled) el.disabled = disabled;
}

function button(label: string, cls: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'btn ' + cls;
  b.textContent = label;
  return b;
}
