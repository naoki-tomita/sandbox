// エントリポイント。UI イベントを api 呼び出しへつなぎ、getStatus をポーリングして
// メータ・再生ヘッド・録音状態を反映する。

import * as api from './api';
import { renderTracks, updateTransport, type TrackHandlers, type TransportEls } from './ui';
import type { EngineStatus, TrackMeta } from './types';

const tracksEl = document.getElementById('tracks')!;
const els: TransportEls = {
  playBtn: document.getElementById('playBtn') as HTMLButtonElement,
  addBtn: document.getElementById('addBtn') as HTMLButtonElement,
  level: document.getElementById('level')!,
  playhead: document.getElementById('playhead')!,
  statusText: document.getElementById('statusText')!,
  warn: document.getElementById('warn')!,
};

let tracks: TrackMeta[] = [];
let currentStatus: EngineStatus | null = null;
// トラック行の再構築判定に使う署名。空文字で「次ティックで強制再構築」。
let lastSig = '';

async function refreshTracks(): Promise<void> {
  tracks = await api.listTracks();
  lastSig = '';
}

const handlers: TrackHandlers = {
  onRec: async (id) => {
    const st = currentStatus;
    if (st?.recording) {
      // 録音中: armed トラックの Stop のみ有効（他行はボタン無効なので届かない）。
      if (st.armedId === id) await api.stopRecord();
    } else {
      await api.armRecord(id);
    }
  },
  onMute: async (id) => {
    const t = tracks.find((t) => t.id === id);
    if (!t) return;
    const next = !t.muted;
    await api.setMute(id, next);
    t.muted = next;
    lastSig = ''; // 見た目を更新するため再構築。
  },
  onDelete: async (id) => {
    await api.deleteTrack(id);
    await refreshTracks();
  },
};

els.playBtn.addEventListener('click', async () => {
  if (currentStatus?.playing) await api.stop();
  else await api.play();
});

els.addBtn.addEventListener('click', async () => {
  await api.addTrack();
  await refreshTracks();
});

async function tick(): Promise<void> {
  const status = await api.getStatus();
  currentStatus = status;

  const sig = JSON.stringify({
    t: tracks.map((t) => [t.id, t.name, t.muted]),
    a: status.armedId,
    r: status.recording,
  });
  if (sig !== lastSig) {
    renderTracks(tracksEl, tracks, status, handlers);
    lastSig = sig;
  }

  updateTransport(els, status);
}

async function init(): Promise<void> {
  await refreshTracks();
  setInterval(() => {
    void tick();
  }, 50);
}

void init();
