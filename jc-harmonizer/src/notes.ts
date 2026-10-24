// MIDI ノート番号と音名の変換。

export const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const noteName = (n: number) => NAMES[n % 12] + (Math.floor(n / 12) - 1);

export const isBlackKey = (n: number) => NAMES[n % 12].includes("#");

// 周波数に一番近いノート番号
export const nearestNote = (hz: number) => Math.round(69 + 12 * Math.log2(hz / 440));
