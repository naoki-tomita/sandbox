// Rust 側（manager.rs）の serde 表現に対応する型。EngineStatus は camelCase。

export interface TrackMeta {
  id: number;
  name: string;
  muted: boolean;
}

export interface EngineStatus {
  playhead: number;
  loopLen: number;
  playing: boolean;
  recording: boolean;
  /** 直近で録音が終了したか（自動停止の検知用、読むとクリアされる）。 */
  recordFinished: boolean;
  armedId: number | null;
  inputLevel: number;
  sampleRate: number;
  maxFrames: number;
  /** 音声デバイスが利用可能か。 */
  audioOk: boolean;
}
